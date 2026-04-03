import Foundation
import JarvisCore

actor EmailService {
    private let config: AppConfig.EmailConfig

    init(config: AppConfig.EmailConfig) {
        self.config = config
    }

    func fetchWorkOrders() async throws -> [WorkOrder] {
        // Connect to IMAP server using configured host/port
        let imap = IMAPClient(
            host: config.imapHost,
            port: config.imapPort,
            email: config.emailAddress,
            password: config.appPassword,
            useTLS: config.useTLS
        )

        let cutoffDate = Calendar.current.date(byAdding: .day, value: -config.lookbackDays, to: Date())!
        let formatter = DateFormatter()
        formatter.dateFormat = "dd-MMM-yyyy"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let dateStr = formatter.string(from: cutoffDate)

        let bodies = try await imap.searchAndFetch(
            folder: "INBOX",
            criteria: "SUBJECT \"\(config.searchSubjectPattern)\" SINCE \(dateStr)"
        )

        return bodies.compactMap { parseWorkOrder(from: $0) }
    }

    private func parseWorkOrder(from body: String) -> WorkOrder? {
        let casePattern = #"(CS\d{7,})"#
        guard let caseMatch = body.range(of: casePattern, options: .regularExpression) else { return nil }
        let caseNumber = String(body[caseMatch])

        func extract(_ label: String) -> String {
            // Match "  Label: value" format from ServiceNow emails
            let pattern = "\\b\(label):\\s*(.+)"
            if let range = body.range(of: pattern, options: .regularExpression) {
                let match = String(body[range])
                if let colonRange = match.range(of: ":\\s*", options: .regularExpression) {
                    return String(match[colonRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            return ""
        }

        return WorkOrder(
            caseNumber: caseNumber,
            store: extract("Store"),
            shortDescription: extract("Short Description"),
            trade: extract("Trade"),
            location: extract("Location"),
            equipment: extract("Equipment"),
            priority: extract("Priority"),
            contact: extract("Store Contact"),
            state: extract("State")
        )
    }
}

// MARK: - Minimal IMAP Client

private actor IMAPClient {
    let host: String
    let port: Int
    let email: String
    let password: String
    let useTLS: Bool

    init(host: String, port: Int, email: String, password: String, useTLS: Bool) {
        self.host = host
        self.port = port
        self.email = email
        self.password = password
        self.useTLS = useTLS
    }

    func searchAndFetch(folder: String, criteria: String) async throws -> [String] {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")

        let connectCode: String
        if useTLS {
            connectCode = "mail = imaplib.IMAP4_SSL('\(host)', \(port))"
        } else {
            connectCode = "mail = imaplib.IMAP4('\(host)', \(port))"
        }

        let script = """
        import imaplib, email, sys, json
        try:
            \(connectCode)
            mail.login('\(email)', '\(password)')
            mail.select('\(folder)', readonly=True)
            status, data = mail.search(None, '\(criteria)')
            if status != 'OK':
                print(json.dumps([]))
                sys.exit(0)
            ids = data[0].split()
            bodies = []
            for eid in ids[-20:]:  # Last 20 matches max
                status, msg_data = mail.fetch(eid, '(RFC822)')
                if status == 'OK':
                    msg = email.message_from_bytes(msg_data[0][1])
                    body = ''
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == 'text/plain':
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body = payload.decode('utf-8', errors='replace')
                                    break
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body = payload.decode('utf-8', errors='replace')
                    if body:
                        bodies.append(body)
            mail.logout()
            print(json.dumps(bodies))
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            print(json.dumps([]))
        """

        let pipe = Pipe()
        let errPipe = Pipe()
        process.standardOutput = pipe
        process.standardError = errPipe
        process.arguments = ["-c", script]

        try process.run()
        // Read stdout before waiting to avoid pipe buffer deadlocks
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            let stderr = String(data: errData, encoding: .utf8) ?? "(no output)"
            Logger.error("IMAP script failed (exit \(process.terminationStatus)): \(stderr)")
        } else if let stderr = String(data: errData, encoding: .utf8), !stderr.isEmpty {
            Logger.error("IMAP warning: \(stderr)")
        }

        guard !data.isEmpty else {
            Logger.error("IMAP returned no data")
            return []
        }

        let bodies = try JSONDecoder().decode([String].self, from: data)
        return bodies
    }
}
