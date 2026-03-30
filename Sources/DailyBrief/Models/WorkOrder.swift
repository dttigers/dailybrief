import Foundation

struct WorkOrder: Codable, Sendable {
    var caseNumber: String
    var store: String
    var shortDescription: String
    var trade: String
    var location: String
    var equipment: String
    var priority: String
    var contact: String
    var state: String
}
