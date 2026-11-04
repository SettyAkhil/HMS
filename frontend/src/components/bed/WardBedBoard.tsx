import { useEffect, useState } from "react"
import { BedCard, type BedCardData } from "./BedCard"

// One room's header -- used by both branches below so a room reads the same
// whether it rendered as a side-by-side column or behind a tab.
function RoomHead<T extends BedCardData>({
  room,
  beds,
}: {
  room: string
  beds: T[]
}) {
  const occupied = beds.filter((b) => b.status === "Occupied").length
  const free = beds.filter((b) => b.status === "Available").length
  return (
    <div className="bed-room-head">
      <span className="bed-room-name">Room {room}</span>
      <span
        className={`bed-room-count${
          occupied === beds.length ? " bed-room-count-full" : ""
        }`}
      >
        {occupied}/{beds.length}
      </span>
      <span className="bed-room-free">{free} free</span>
    </div>
  )
}

// Rooms sit as a horizontal tab row (click one to open it) instead of every
// room's beds being stacked and shown at once -- makes a ward with many
// rooms fast to scan and drill into, on both Bed Management (interactive)
// and the Inpatient Bed Board (read-only).
// Generic over the caller's own bed row shape (T) rather than fixed to the
// base BedCardData -- BedManagementPage's `Bed` has several fields
// BedCardData doesn't, and its callbacks (openBed, etc.) expect to receive
// that full shape back. Without the generic, TS can't guarantee a callback
// typed for the caller's richer T is safe to hand rows that are only known
// to be BedCardData at this component's boundary.
export function WardBedBoard<T extends BedCardData>({
  rooms,
  onBedClick,
  onPatientClick,
  readOnly,
}: {
  rooms: Map<string, T[]>
  onBedClick?: (bed: T) => void
  onPatientClick?: (bed: T) => void
  readOnly?: boolean
}) {
  const roomNames = Array.from(rooms.keys())
  const [selectedRoom, setSelectedRoom] = useState(roomNames[0] || "")

  useEffect(() => {
    if (!selectedRoom || !rooms.has(selectedRoom))
      setSelectedRoom(roomNames[0] || "")
    // Only re-check when the set of rooms actually changes (e.g. switching
    // ward), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomNames.join(",")])

  const activeBeds = rooms.get(selectedRoom) || []

  if (roomNames.length === 0) return null

  const grid = (beds: T[]) => (
    <div className="bed-info-card-grid">
      {beds.map((bed) => (
        <BedCard
          key={bed.id}
          bed={bed}
          readOnly={readOnly}
          onClick={onBedClick ? () => onBedClick(bed) : undefined}
          onPatientClick={onPatientClick}
        />
      ))}
    </div>
  )

  // One or two rooms fit side by side. Both columns are auto-fit tracks off
  // the same --bed-card-min, so the cards line up across the gutter instead of
  // each column sizing itself independently (196px one side, 199px the other).
  if (roomNames.length <= 2) {
    return (
      <div className="bed-room-grid">
        {roomNames.map((room) => (
          <div className="bed-room-col" key={room}>
            <RoomHead room={room} beds={rooms.get(room)!} />
            {grid(rooms.get(room)!)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="ward-room-tabs">
        {roomNames.map((room) => {
          const roomBeds = rooms.get(room)!
          const occupied = roomBeds.filter(
            (b) => b.status === "Occupied",
          ).length
          return (
            <button
              key={room}
              type="button"
              className={`ward-room-tab${
                room === selectedRoom ? " ward-room-tab-active" : ""
              }`}
              onClick={() => setSelectedRoom(room)}
            >
              Room {room}
              <span className="ward-room-tab-count">
                {occupied}/{roomBeds.length}
              </span>
            </button>
          )
        })}
      </div>
      <div className="bed-room-col" style={{ marginTop: "0.9rem" }}>
        <RoomHead room={selectedRoom} beds={activeBeds} />
        {grid(activeBeds)}
      </div>
    </div>
  )
}
