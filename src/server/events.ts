import { EventEmitter } from 'node:events'

/* Server-Sent Events fan-out. One server process serves the whole clinic, so an in-process emitter is enough. */
const g = globalThis as unknown as { __himsogBus?: EventEmitter }
export const bus = (g.__himsogBus ??= new EventEmitter().setMaxListeners(100))

export const CHANGED = 'changed'
export const notifyChanged = () => bus.emit(CHANGED, Date.now())
