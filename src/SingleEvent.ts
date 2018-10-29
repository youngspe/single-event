type Listener<A> = (args: A) => void;

abstract class SuperEvent<A, B> implements singleEvent.SingleEvent<B> {
    private readonly _listeners = new Set<Listener<B>>();
    private readonly _children = new Set<SuperEvent<B, any>>();
    private readonly _connect: () => void;
    private readonly _disconnect: () => void;

    protected readonly _boundTrigger = (args: A) => this._trigger(args);

    protected constructor(connect: () => void, disconnect: () => void) {
        this._connect = connect;
        this._disconnect = disconnect;
    }

    protected _notifyListeners(args: B) {
        for (let l of this._listeners) {
            l(args);
        }
        for (let c of this._children) {
            c._trigger(args);
        }
    }

    protected abstract _trigger(args: A): void;

    public listen(listener: Listener<B>) {
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._connect();
        }
        this._listeners.add(listener);
    }

    public unlisten(listener: Listener<any>) {
        this._listeners.delete(listener);
        for (let child of this._children) {
            child.unlisten(listener);
        }
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._disconnect();
        }
    }

    protected addChild(e: SuperEvent<B, any>) {
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._connect();
        }
        this._children.add(e);
    }

    protected removeChild(e: SuperEvent<B, any>) {
        this._children.delete(e);
        if (this._listeners.size === 0 && this._children.size === 0) {
            this._disconnect();
        }
    }

    public next(): Promise<B> {
        let l: Listener<B>;
        return new Promise(ok => {
            l = a => {
                ok(a);
                this.unlisten(l);
            };
            this.listen(l);
        });
    }

    public filter(pred: (args: B) => boolean) {
        let filterEvent: FilterEvent<B>;
        filterEvent = new FilterEvent(
            () => this.addChild(filterEvent),
            () => this.removeChild(filterEvent),
            pred,
        );
        return filterEvent;
    }

    public map<C>(transform: (args: B) => C) {
        let mapEvent: MapEvent<B, C>;
        mapEvent = new MapEvent(
            () => this.addChild(mapEvent),
            () => this.removeChild(mapEvent),
            transform,
        );
        return mapEvent;
    }
}

class SingleEventSource<A> extends SuperEvent<A, A> {
    protected _trigger(args: A) {
        this._notifyListeners(args);
    }

    public static create<A>(connect: () => void, disconnect: () => void): [SingleEventSource<A>, Listener<A>] {
        let event = new SingleEventSource<A>(connect, disconnect);
        return [event, a => { event._trigger(a) }];
    }
}

class FilterEvent<A> extends SuperEvent<A, A> {
    private readonly _pred: (args: A) => boolean;

    public constructor(connect: () => void, disconnect: () => void, pred: (args: A) => boolean) {
        super(connect, disconnect);
        this._pred = pred;
    }

    protected _trigger(args: A) {
        if (this._pred(args)) {
            this._notifyListeners(args);
        }
    }
}

class MapEvent<A, B> extends SuperEvent<A, B> {
    private readonly _transform: (args: A) => B;

    public constructor(connect: () => void, disconnect: () => void, transform: (args: A) => B) {
        super(connect, disconnect);
        this._transform = transform;
    }

    protected _trigger(args: A) {
        this._notifyListeners(this._transform(args));
    }
}

export function singleEvent<A>(connect = () => { }, disconnect = () => { }): [singleEvent.SingleEvent<A>, Listener<A>] {
    return SingleEventSource.create(connect, disconnect);
}

export namespace singleEvent {
    export interface SingleEvent<A> {
        listen(l: Listener<A>): void;
        unlisten(l: Listener<A>): void;
        next(): Promise<A>;
        filter(pred: (args: A) => boolean): SingleEvent<A>;
        map<B>(transform: (args: A) => B): SingleEvent<B>;
    }
}
