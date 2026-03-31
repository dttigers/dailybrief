import Foundation

public struct WorkOrder: Codable, Sendable {
    public var caseNumber: String
    public var store: String
    public var shortDescription: String
    public var trade: String
    public var location: String
    public var equipment: String
    public var priority: String
    public var contact: String
    public var state: String

    public init(
        caseNumber: String,
        store: String,
        shortDescription: String,
        trade: String,
        location: String,
        equipment: String,
        priority: String,
        contact: String,
        state: String
    ) {
        self.caseNumber = caseNumber
        self.store = store
        self.shortDescription = shortDescription
        self.trade = trade
        self.location = location
        self.equipment = equipment
        self.priority = priority
        self.contact = contact
        self.state = state
    }
}
