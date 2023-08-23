import {Event, buildMessage} from '..'
import {Type} from '../utils/lang'
import {Observable, Subject} from 'rxjs'

export abstract class AggregateRoot extends Object {
  private readonly eventsSubject = new Subject<Event>()

  /** The event stream of executing aggregate methods (commands). */
  public readonly events$: Observable<Event> = this.eventsSubject.asObservable()

  protected apply(event: Event): void
  protected apply<T extends Event>(type: Type<T>, event: T): void
  protected apply<T extends Event>(eventOrType: T | Type<T>, event?: T) {
    if (typeof eventOrType === 'function' && event) {
      // @ts-ignore
      this.eventsSubject.next(buildMessage(eventOrType, event))
    } else {
      this.eventsSubject.next(eventOrType)
    }
  }
}
