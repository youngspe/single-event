type Listener<A, S> = (args: A, sender: S) => void;

abstract class SuperEvent<A, B, S> implements singleEvent.SingleEvent<B, S> {
    private readonly _listeners = new Set<Listener<B, S>>();
    private readonly _children = new Set<SuperEvent<B, any, S>>();
    private readonly _connect: () => void;
    private readonly _disconnect: () => void;
    private readonly _sender: S;

    protected readonly _boundTrigger = (args: A) => this._trigger(args);

    protected constructor(sender: S, connect: () => void, disconnect: () => void) {
        this._sender = sender;
        this._connect = connect;
        this._disconnect = disconnect;
    }

    protected _notifyListeners(args: B) {
        for (let l of this._listeners) {
            l(args, this._sender);
        }
        for (let c of this._children) {
            c._trigger(args);
        }
    }

    protected abstract _trigger(args: A): void;

    public listen(listener: Listener<B, S>) {
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._connect();
        }
        this._listeners.add(listener);
    }

    public unlisten(listener: Listener<any, S>) {
        this._listeners.delete(listener);
        for (let child of this._children) {
            child.unlisten(listener);
        }
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._disconnect();
        }
    }

    protected addChild(e: SuperEvent<B, any, S>) {
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._connect();
        }
        this._children.add(e);
    }

    protected removeChild(e: SuperEvent<B, any, S>) {
        this._children.delete(e);
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._disconnect();
        }
    }

    public next(): Promise<B> {
        let l: Listener<B, S>;
        return new Promise(ok => {
            l = a => {
                ok(a);
                this.unlisten(l);
            };
            this.listen(l);
        });
    }

    public filter(pred: (args: B) => boolean) {
        let filterEvent: FilterEvent<B, S>;
        filterEvent = new FilterEvent(
            this._sender,
            () => this.addChild(filterEvent),
            () => this.removeChild(filterEvent),
            pred,
        );
        return filterEvent;
    }

    public map<C>(transform: (args: B) => C) {
        let mapEvent: MapEvent<B, C, S>;
        mapEvent = new MapEvent(
            this._sender,
            () => this.addChild(mapEvent),
            () => this.removeChild(mapEvent),
            transform,
        );
        return mapEvent;
    }

    public async take(count: number): Promise<B[]> {
        let array: B[] = [];
        for (let i = 0; i < count; ++i) {
            array.push(await this.next());
        }
        return array;
    }
}

class SingleEventSource<A, S> extends SuperEvent<A, A, S> {
    protected _trigger(args: A) {
        this._notifyListeners(args);
    }

    public static create<A, S = undefined>(sender: S, connect: () => void, disconnect: () => void):
        [SingleEventSource<A, S>, (a: A) => void] {
        let event = new SingleEventSource<A, S>(sender, connect, disconnect);
        return [event, a => event._trigger(a)];
    }
}

class FilterEvent<A, S> extends SuperEvent<A, A, S> {
    private readonly _pred: (args: A) => boolean;

    public constructor(sender: S, connect: () => void, disconnect: () => void, pred: (args: A) => boolean) {
        super(sender, connect, disconnect);
        this._pred = pred;
    }

    protected _trigger(args: A) {
        if (this._pred(args)) {
            this._notifyListeners(args);
        }
    }
}

class MapEvent<A, B, S> extends SuperEvent<A, B, S> {
    private readonly _transform: (args: A) => B;

    public constructor(sender: S, connect: () => void, disconnect: () => void, transform: (args: A) => B) {
        super(sender, connect, disconnect);
        this._transform = transform;
    }

    protected _trigger(args: A) {
        this._notifyListeners(this._transform(args));
    }
}

/**
 * Creates an instance of SingleEvent and a function that triggers the event.
 *
 * @export
 * @template A
 * The type of argument that will be used to trigger the event and propagate to all event listeners.
 * @template S
 * A type representing the sender of the event.
 * @param {S} sender
 * This value will be passed to listeners each time the event fires.
 * This can be used to distinguish the source of the event when the same listener is added to
 * multiple events.
 * @param onConnect
 * This function will be called any time a listener is added when the event previously had no
 * listeners.
 * This can be used to perform setup operations or aquire resources that are only needed while the
 * event has listeners.
 * @param onDisconnect
 * This function will be called when a listener is removed and as a result the event no longer has
 * any listeners.
 * This can be used to perform cleanup operations and release resources that are only needed while
 * the event has listeners.
 * @returns {[singleEvent.SingleEvent<A, S>, (a: A) => void]}
 */
export function singleEvent<A, S = undefined>(sender: S, onConnect = () => { }, onDisconnect = () => { }): [singleEvent.SingleEvent<A, S>, (a: A) => void] {
    return SingleEventSource.create(sender, onConnect, onDisconnect);
}

export namespace singleEvent {
    /**
     * An object that emits a single type of event.
     * When the event is fired, all listeners added to the event will be invoked.
     *
     * @export
     * @interface SingleEvent
     * @template A
     * @template S
     */
    export interface SingleEvent<A, S = undefined> {
        /**
         * Adds an event listener.
         *
         * @param listener
         * The listener to add.
         * 
         * @memberof SingleEvent
         */
        listen(listener: Listener<A, S>): void;
        /**
         * Removes an event listener.
         *
         * @param listener
         * The listener to remove.
         * If it was previously added as a listener of the event, it will no longer be invoked when
         * the event fires.
         * Additionally the listener will be removed from any child events.
         * @memberof SingleEvent
         */
        unlisten(listener: Listener<A, S>): void;
        /**
         * Returns a promise that will be fulfilled the next time the event fires.
         * 
         * @memberof SingleEvent
         */
        next(): Promise<A>;
        /**
         * Returns a child of this event where listeners are only invoked when the event arguments
         * are accepted by a predicate function.
         *
         * @param pred
         * The predicate function.
         * It should return `true` if the listeners should be invoked, and otherwise return `false`.
         * @memberof SingleEvent
         */
        filter(pred: (args: A) => boolean): SingleEvent<A, S>;
        /**
         * Returns a child of this event where event arguments are passed through a transformation
         * function before being passed to the listener.
         *
         * @template B
         * @param transform
         * The transformation function.
         * It should the event argument of the parent event and return the argument that will be
         * passed to the listeners of the child event.
         * @memberof SingleEvent
         */
        map<B>(transform: (args: A) => B): SingleEvent<B, S>;
        /**
         * After the event has been fired a specified number of times, return an array of arguments
         * for each time the event fired.
         *
         * @param count
         * The number of events to wait for until the promise is fulfilled.
         * @returns
         * A promise yielding a list of event arguments--one for each time the event was fired.
         * @memberof SingleEvent
         */
        take(count: number): Promise<A[]>;
    }
}
