export type TimelineStage = 'OBSERVE' | 'DECIDE' | 'CHECK' | 'ACT' | 'ERROR' | 'RECOVERY';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  timeString: string;
  stage: TimelineStage;
  title: string;
  description: string;
  fieldId?: string;
  status: 'info' | 'success' | 'warning' | 'error';
  details?: unknown;
}

class TimelineStore {
  private events: TimelineEvent[] = [];
  private listeners: Set<(events: TimelineEvent[]) => void> = new Set();

  public addEvent(
    event: Omit<TimelineEvent, 'id' | 'timestamp' | 'timeString'>
  ): TimelineEvent {
    const now = Date.now();
    const dt = new Date(now);
    const timeString = dt.toTimeString().split(' ')[0] + '.' + String(dt.getMilliseconds()).padStart(3, '0');

    const newEvent: TimelineEvent = {
      ...event,
      id: `evt_${now}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      timeString,
    };

    this.events.unshift(newEvent);

    // Keep up to 200 recent events
    if (this.events.length > 200) {
      this.events.pop();
    }

    this.notify();
    return newEvent;
  }

  public getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  public clearEvents(): void {
    this.events = [];
    this.notify();
  }

  public subscribe(listener: (events: TimelineEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.events]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = [...this.events];
    this.listeners.forEach((l) => l(snapshot));
  }
}

export const timelineStore = new TimelineStore();
