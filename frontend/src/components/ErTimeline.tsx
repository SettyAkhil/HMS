import React from "react"
import {
  FiClock,
  FiActivity,
  FiUserPlus,
  FiAlertCircle,
  FiClipboard,
  FiCheckCircle,
} from "react-icons/fi"
import { formatDateTimeIST } from "../lib/format"

export type ErTimelineEventLocal = {
  id?: number
  event_type: string
  event_time: string
  description: string
  author: string | null
  metadata?: any
}

export default function ErTimeline({
  events,
}: {
  events: ErTimelineEventLocal[]
}) {
  if (!events || events.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-none border border-dashed border-gray-300">
        No chronological events recorded yet.
      </div>
    )
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "arrival":
        return <FiClock className="text-blue-500" />
      case "registration":
        return <FiUserPlus className="text-green-500" />
      case "vitals":
        return <FiActivity className="text-red-500" />
      case "triage":
        return <FiAlertCircle className="text-orange-500" />
      case "treatment":
        return <FiActivity className="text-purple-500" />
      case "doctor_assignment":
        return <FiUserPlus className="text-indigo-500" />
      case "assessment":
        return <FiClipboard className="text-gray-500" />
      case "disposition":
        return <FiCheckCircle className="text-emerald-600" />
      default:
        return <FiClock className="text-gray-400" />
    }
  }

  return (
    <div className="relative border-l-2 border-gray-200 ml-4 space-y-6 pb-4">
      {events.map((e, idx) => (
        <div key={e.id || idx} className="relative pl-6">
          <div className="absolute -left-[17px] top-1 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-sm">
            {getIcon(e.event_type)}
          </div>
          <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold text-gray-900 text-sm">
                {e.event_time ? formatDateTimeIST(e.event_time) : "-"}
              </span>
              <span className="text-[10px] font-mono uppercase text-gray-500 tracking-wider bg-gray-100 px-2 py-0.5 rounded">
                {e.event_type.replace("_", " ")}
              </span>
            </div>
            <p className="text-gray-700 text-[13px] leading-relaxed">
              {e.description}
            </p>
            {e.author && (
              <p className="text-[11px] text-gray-400 mt-2 italic">
                — {e.author}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
