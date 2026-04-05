import Foundation

// MARK: - API Response Types

/// Decodable struct matching the exact JSON shape returned by Vigil Core API.
/// Dates come as ISO 8601 strings, isFavorited as 0/1 integer, tags as [String].
private struct APIThoughtResponse: Decodable, Sendable {
    let id: Int64
    let content: String
    let category: String?
    let confidence: Double?
    let source: String
    let createdAt: String
    let modifiedAt: String
    let cloudKitRecordID: String
    let syncStatus: String
    let lastSyncedAt: String?
    let taskStatus: String?
    let therapyClassification: String?
    let tags: [String]?
    let isFavorited: Bool
}

/// Response wrapper for the /tags endpoint.
private struct TagsResponse: Decodable, Sendable {
    let tags: [String]
}

/// Response wrapper for the /thoughts/:id/links endpoint.
private struct LinksResponse: Decodable, Sendable {
    let links: [APIThoughtResponse]
}

/// Response wrapper for link creation.
private struct LinkCreateResponse: Decodable, Sendable {
    let linked: Bool
    let sourceId: Int64
    let targetId: Int64
}

/// Response wrapper for bulk delete (uses "deleted" key).
private struct BulkDeleteResponse: Decodable, Sendable {
    let deleted: Int
}

// MARK: - Request Body Types

private struct CreateThoughtBody: Encodable {
    let content: String
    let source: String
    let category: String?
    let tags: [String]?
}

private struct UpdateThoughtBody: Encodable {
    let content: String?
    let category: String?
    let taskStatus: String?
    let therapyClassification: String?
    let tags: [String]?
    let isFavorited: Bool?
}

private struct AddTagBody: Encodable {
    let tag: String
}

private struct LinkBody: Encodable {
    let targetId: Int64
}

private struct BulkIdsBody: Encodable {
    let ids: [Int64]
}

private struct BulkRecategorizeBody: Encodable {
    let ids: [Int64]
    let category: String
}

private struct BulkTagBody: Encodable {
    let ids: [Int64]
    let tag: String
    let action: String
}

private struct BulkTherapyClassifyBody: Encodable {
    let ids: [Int64]
    let classification: String
}

// MARK: - APIThoughtStore

/// A ThoughtRepository-conforming actor that calls Vigil Core API
/// instead of direct GRDB access. When wired in, the Mac app
/// fetches/writes data through the REST API.
public actor APIThoughtStore: ThoughtRepository {

    private let client: VigilAPIClient

    nonisolated(unsafe) private static let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) private static let iso8601FormatterNoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public init(client: VigilAPIClient) {
        self.client = client
    }

    // MARK: - Private Helpers

    /// Convert an API response to the Swift Thought model.
    private func toThought(_ r: APIThoughtResponse) -> Thought {
        let createdAt = Self.parseISO8601(r.createdAt) ?? Date()
        let modifiedAt = Self.parseISO8601(r.modifiedAt) ?? Date()

        return Thought(
            id: r.id,
            content: r.content,
            category: r.category.flatMap { ThoughtCategory(rawValue: $0) },
            confidence: r.confidence,
            source: CaptureSource(rawValue: r.source) ?? .text,
            createdAt: createdAt,
            modifiedAt: modifiedAt,
            taskStatus: r.taskStatus.flatMap { TaskStatus(rawValue: $0) },
            therapyClassification: r.therapyClassification.flatMap { TherapyClassification(rawValue: $0) },
            tags: (r.tags ?? []).isEmpty ? nil : r.tags,
            isFavorited: r.isFavorited
        )
    }

    /// Parse an ISO 8601 date string, trying fractional seconds first.
    private static func parseISO8601(_ string: String) -> Date? {
        iso8601Formatter.date(from: string) ?? iso8601FormatterNoFractional.date(from: string)
    }

    /// Format a Date to ISO 8601 string for query parameters.
    private static func formatISO8601(_ date: Date) -> String {
        iso8601Formatter.string(from: date)
    }

    // MARK: - CRUD Operations

    public func fetch(id: Int64) async throws -> Thought? {
        do {
            let response: APIThoughtResponse = try await client.get(path: "/thoughts/\(id)")
            return toThought(response)
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return nil
        }
    }

    public func saveThought(_ thought: Thought) async throws -> Thought {
        let body = CreateThoughtBody(
            content: thought.content,
            source: thought.source.rawValue,
            category: thought.category?.rawValue,
            tags: thought.tags
        )
        let response: APIThoughtResponse = try await client.post(path: "/thoughts", body: body)
        return toThought(response)
    }

    @discardableResult
    public func update(_ thought: Thought) async throws -> Thought {
        guard let id = thought.id else {
            throw VigilAPIError.httpError(statusCode: 400, message: "Cannot update thought without ID")
        }
        let body = UpdateThoughtBody(
            content: thought.content,
            category: thought.category?.rawValue,
            taskStatus: thought.taskStatus?.rawValue,
            therapyClassification: thought.therapyClassification?.rawValue,
            tags: thought.tags,
            isFavorited: thought.isFavorited
        )
        let response: APIThoughtResponse = try await client.put(path: "/thoughts/\(id)", body: body)
        return toThought(response)
    }

    @discardableResult
    public func delete(id: Int64) async throws -> Bool {
        do {
            try await client.delete(path: "/thoughts/\(id)")
            return true
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return false
        }
    }

    // MARK: - List / Filter Operations

    public func fetchAll(
        category: ThoughtCategory?,
        limit: Int,
        offset: Int
    ) async throws -> [Thought] {
        var query: [String: String] = [
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        if let category = category {
            query["category"] = category.rawValue
        }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchFiltered(
        category: ThoughtCategory?,
        source: CaptureSource?,
        after: Date?,
        tag: String?,
        favoritesOnly: Bool,
        limit: Int,
        offset: Int
    ) async throws -> [Thought] {
        var query: [String: String] = [
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        if let category = category { query["category"] = category.rawValue }
        if let source = source { query["source"] = source.rawValue }
        if let after = after { query["after"] = Self.formatISO8601(after) }
        if let tag = tag { query["tag"] = tag }
        if favoritesOnly { query["favoritesOnly"] = "true" }

        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func search(query: String, limit: Int) async throws -> [Thought] {
        let params: [String: String] = [
            "q": query,
            "limit": "\(limit)"
        ]
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: params)
        return response.data.map { toThought($0) }
    }

    public func fetchTasks(status: TaskStatus?, limit: Int) async throws -> [Thought] {
        var query: [String: String] = [
            "category": "task",
            "limit": "\(limit)"
        ]
        if let status = status { query["taskStatus"] = status.rawValue }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchTherapyThoughts(
        classification: TherapyClassification?,
        limit: Int,
        offset: Int
    ) async throws -> [Thought] {
        var query: [String: String] = [
            "category": "therapy",
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        if let classification = classification {
            query["therapyClassification"] = classification.rawValue
        }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchByTag(tag: String, limit: Int, offset: Int) async throws -> [Thought] {
        let query: [String: String] = [
            "tag": tag,
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchFavorites(limit: Int, offset: Int) async throws -> [Thought] {
        let query: [String: String] = [
            "favoritesOnly": "true",
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchTherapyThoughtsByDateRange(
        from startDate: Date,
        to endDate: Date,
        classification: TherapyClassification?
    ) async throws -> [Thought] {
        var query: [String: String] = [
            "category": "therapy",
            "after": Self.formatISO8601(startDate),
            "before": Self.formatISO8601(endDate),
            "limit": "200"
        ]
        if let classification = classification {
            query["therapyClassification"] = classification.rawValue
        }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchRecentTherapyThoughts(
        days: Int,
        classification: TherapyClassification?,
        limit: Int
    ) async throws -> [Thought] {
        let afterDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        var query: [String: String] = [
            "category": "therapy",
            "after": Self.formatISO8601(afterDate),
            "limit": "\(limit)"
        ]
        if let classification = classification {
            query["therapyClassification"] = classification.rawValue
        }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.data.map { toThought($0) }
    }

    public func fetchLinkedThoughts(thoughtId: Int64) async throws -> [Thought] {
        let response: LinksResponse = try await client.get(path: "/thoughts/\(thoughtId)/links")
        return response.links.map { toThought($0) }
    }

    // MARK: - Count Operations

    public func count(category: ThoughtCategory?) async throws -> Int {
        var query: [String: String] = ["limit": "0"]
        if let category = category { query["category"] = category.rawValue }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.total
    }

    public func countFiltered(
        category: ThoughtCategory?,
        source: CaptureSource?,
        after: Date?,
        tag: String?,
        favoritesOnly: Bool
    ) async throws -> Int {
        var query: [String: String] = ["limit": "0"]
        if let category = category { query["category"] = category.rawValue }
        if let source = source { query["source"] = source.rawValue }
        if let after = after { query["after"] = Self.formatISO8601(after) }
        if let tag = tag { query["tag"] = tag }
        if favoritesOnly { query["favoritesOnly"] = "true" }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.total
    }

    public func countTasks(status: TaskStatus?) async throws -> Int {
        var query: [String: String] = ["category": "task", "limit": "0"]
        if let status = status { query["taskStatus"] = status.rawValue }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.total
    }

    public func countTherapy(classification: TherapyClassification?) async throws -> Int {
        var query: [String: String] = ["category": "therapy", "limit": "0"]
        if let classification = classification {
            query["therapyClassification"] = classification.rawValue
        }
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.total
    }

    public func countUnclassifiedTherapy() async throws -> Int {
        // Total therapy thoughts minus classified ones (subtraction approach)
        let total = try await countTherapy(classification: nil)
        let selfLearnable = try await countTherapy(classification: .selfLearnable)
        let bringToTherapist = try await countTherapy(classification: .bringToTherapist)
        return total - selfLearnable - bringToTherapist
    }

    public func countFavorites() async throws -> Int {
        let query: [String: String] = ["favoritesOnly": "true", "limit": "0"]
        let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
        return response.total
    }

    public func countLinks(thoughtId: Int64) async throws -> Int {
        let response: LinksResponse = try await client.get(path: "/thoughts/\(thoughtId)/links")
        return response.links.count
    }

    // MARK: - Tags

    public func allUniqueTags() async throws -> [String] {
        let response: TagsResponse = try await client.get(path: "/tags")
        return response.tags
    }

    // MARK: - Task Operations

    @discardableResult
    public func updateTaskStatus(id: Int64, status: TaskStatus) async throws -> Thought {
        let body = UpdateThoughtBody(
            content: nil,
            category: nil,
            taskStatus: status.rawValue,
            therapyClassification: nil,
            tags: nil,
            isFavorited: nil
        )
        let response: APIThoughtResponse = try await client.put(path: "/thoughts/\(id)", body: body)
        return toThought(response)
    }

    // MARK: - Tag Operations

    @discardableResult
    public func addTag(id: Int64, tag: String) async throws -> Thought? {
        do {
            let body = AddTagBody(tag: tag)
            let response: APIThoughtResponse = try await client.post(path: "/thoughts/\(id)/tags", body: body)
            return toThought(response)
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return nil
        }
    }

    @discardableResult
    public func removeTag(id: Int64, tag: String) async throws -> Thought? {
        do {
            let encodedTag = tag.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? tag
            try await client.delete(path: "/thoughts/\(id)/tags/\(encodedTag)")
            // Fetch the updated thought after tag removal
            return try await fetch(id: id)
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return nil
        }
    }

    // MARK: - Favorite Operations

    @discardableResult
    public func toggleFavorite(id: Int64) async throws -> Thought? {
        do {
            let body: [String: String] = [:]
            let response: APIThoughtResponse = try await client.put(path: "/thoughts/\(id)/favorite", body: body)
            return toThought(response)
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return nil
        }
    }

    // MARK: - Link Operations

    @discardableResult
    public func linkThoughts(sourceId: Int64, targetId: Int64) async throws -> ThoughtLink? {
        do {
            let body = LinkBody(targetId: targetId)
            let response: LinkCreateResponse = try await client.post(path: "/thoughts/\(sourceId)/links", body: body)
            return ThoughtLink(
                sourceThoughtId: response.sourceId,
                targetThoughtId: response.targetId,
                createdAt: Date()
            )
        } catch VigilAPIError.httpError(let statusCode, _) where statusCode == 404 {
            return nil
        }
    }

    public func unlinkThoughts(sourceId: Int64, targetId: Int64) async throws {
        try await client.delete(path: "/thoughts/\(sourceId)/links/\(targetId)")
    }

    // MARK: - Bulk Operations

    @discardableResult
    public func bulkDelete(ids: Set<Int64>) async throws -> Int {
        let body = BulkIdsBody(ids: Array(ids))
        let response: BulkDeleteResponse = try await client.post(path: "/thoughts/bulk/delete", body: body)
        return response.deleted
    }

    @discardableResult
    public func bulkUpdateCategory(ids: Set<Int64>, category: ThoughtCategory) async throws -> Int {
        let body = BulkRecategorizeBody(ids: Array(ids), category: category.rawValue)
        let response: CountResponse = try await client.post(path: "/thoughts/bulk/recategorize", body: body)
        return response.updated
    }

    @discardableResult
    public func bulkAddTag(ids: Set<Int64>, tag: String) async throws -> Int {
        let body = BulkTagBody(ids: Array(ids), tag: tag, action: "add")
        let response: CountResponse = try await client.post(path: "/thoughts/bulk/tag", body: body)
        return response.updated
    }

    @discardableResult
    public func bulkRemoveTag(ids: Set<Int64>, tag: String) async throws -> Int {
        let body = BulkTagBody(ids: Array(ids), tag: tag, action: "remove")
        let response: CountResponse = try await client.post(path: "/thoughts/bulk/tag", body: body)
        return response.updated
    }

    @discardableResult
    public func bulkUpdateTherapyClassification(ids: Set<Int64>, classification: TherapyClassification) async throws -> Int {
        let body = BulkTherapyClassifyBody(ids: Array(ids), classification: classification.rawValue)
        let response: CountResponse = try await client.post(path: "/thoughts/bulk/therapy-classify", body: body)
        return response.updated
    }
}
