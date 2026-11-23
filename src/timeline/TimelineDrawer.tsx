import React, { useState, useEffect } from 'react';
import { timelineStore, TimelineEvent, TimelineStage } from './timelineStore';
import { Clock, Trash2, X } from 'lucide-react';

interface TimelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TimelineDrawer: React.FC<TimelineDrawerProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filterStage, setFilterStage] = useState<TimelineStage | 'ALL'>('ALL');

  useEffect(() => {
    const unsubscribe = timelineStore.subscribe((newEvents) => {
      setEvents(newEvents);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const filteredEvents = filterStage === 'ALL'
    ? events
    : events.filter((e) => e.stage === filterStage);

  const getStageColor = (stage: TimelineStage) => {
    switch (stage) {
      case 'OBSERVE': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'DECIDE': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'CHECK': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'ACT': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'ERROR': return 'bg-red-100 text-red-700 border-red-200';
      case 'RECOVERY': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex justify-end">
      <div className="w-80 max-w-full bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold tracking-tight">Agent Reasoning Timeline</h2>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
              {events.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1 overflow-x-auto py-1">
            {(['ALL', 'OBSERVE', 'DECIDE', 'CHECK', 'ACT', 'ERROR', 'RECOVERY'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStage(st)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                  filterStage === st
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <button
            onClick={() => timelineStore.clearEvents()}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
            title="Clear timeline"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Event List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2 opacity-50" />
              <p>No events recorded in this session yet.</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Scan, match, fill, or attach to see live event logging.
              </p>
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition text-xs"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase font-mono ${getStageColor(
                      evt.stage
                    )}`}
                  >
                    {evt.stage}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{evt.timeString}</span>
                </div>
                <div className="font-semibold text-slate-800 text-[11px] leading-tight mt-0.5">
                  {evt.title}
                </div>
                <p className="text-[10.5px] text-slate-600 mt-1 leading-snug">
                  {evt.description}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
