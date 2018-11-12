# single-event 

A library for JavaScript and TypeScript that provides objects that emit a single kind of event.
This is especially helpful in TypeScript where passing in a string to identify which event to listen to can make it harder to have strongly-typed events.

This library also makes it possible to await an occurrence of an event through a `Promise` and to perform map or filter operations on an event.

This is just something I put together while working on my own projects, so it may not be perfect.
Feel free to create an issue or a pull request if you feel something could be improved.

## API

### `function singleEvent(sender, onConnect, onDisconnect)`

Returns a tuple (an array of length 2) containing a `SingleEvent` object and a function that may be used to fire events from that object.
This function takes up to three parameters:
- `sender`: The object that the event "belongs" to.
This can be used to distinguish the source of an event when the same listener is added to multiple events.
May be `undefined`.
- `onConnect`: A function that will be called any time a listener is added when the event previously had no listeners.
This can be used to perform setup operations or aquire resources that are only needed while the event has listeners.
If left `undefined`, no special action will be performed when the first listener is added.
- `onDisconnect`: A function that will be  called when a listener is removed and as a result the event no longer has any listeners.
This can be used to perform cleanup operations and release resources that are only needed while the event has listeners.
If left `undefined`, no special action will be performed when the last listener is removed.

Example:

```js
const singleEvent = require('singleEvent');
// or
import singleEvent from 'single-event';

let [onClick, triggerClick] = singleEvent();
```

``` typescript
// In TypeScript, the argument type must be specified or inferred.
let [onClick, triggerClick] = singleEvent<{ when: Date }>();
```

``` typescript
// with sender, onConnect, and onDisconnect
let onClick, triggerClick;

function onElementClick(e) {
    triggerClick({ when: new Date() });
}

[onClick, triggerClick] = singleEvent(
    this,
    () => domElement.addEventListener('input', onElementClick),
    () => domElement.removeEventListener('input', onElementClick),
);
```

### `type Listener<A, S>`

A function that may be called when an event is fired.
 takes up to two arguments:

- `args`: the value of type `A` that was passed into the trigger function when the event was fired.
- `sender`: a value of type `S` that is the "owner" of the event that called the listener.
If the listener is added to more than one event object, this can be used to determine which one caused the listener to be called.

The return value of the listener is not used.

Example:

```typescript
// JavaScript
let myListener = (args, sender) => doSomething(args);
// TypeScript
let myListener = (args: { when: Date }, sender: MyClass) => doSomething(args);
```

### `interface SingleEvent<A, S>`

This type represents an event object.
Type argument `A` is the type of the event argument that is passed to the listeners.
Type argument `S` is the type of the sender object that the event belongs to.

To import the type in TypeScript:

```typescript
import singleEvent, { SingleEvent } from 'single-event';
```

#### `SingleEvent#listen(listener)`

Adds a function to be called when the event is fired.
When the event is fired, `listener` will be called with the argument that is passed to the trigger function
and the sender of the event.

Example:

```typescript
let myListener = (args, sender) => console.log(args);

onClick.listen(myListener);

// later:
triggerClick({ when: new Date() });
// this will be logged in the console:
// 2018-11-11T23:14:47.052Z
```

#### `SingleEvent#unlisten(listener)`

Removes a listener from an event.
Also removes the listener from any events spawned from this event
(e.g. from `map` or `filter`).

If the listener was previously added, the listener will no longer be called when the event is fired.
If the listener was not previously added, no action will be performed.

Example:

```typescript
onClick.unlisten(myListener);

// later:
triggerClick({ when: new Date() });
// nothing is logged to the console.
```

#### `SingleEvent#next()`

Returns a `Promise` that will be fulfilled the next time the event fires.

Example:

```typescript
onClick.next().then(args => doSomething(args));
// or
let args = await onClick.next();
doSomething(args);
```

#### `SingleEvent#filter(pred)`

Returns a child of this event that will be fired whenever its parent is fired and a specified condition is met.
It takes one parameter:

- `pred`: A function of the form `(args: A) => boolean` the returns true if the child event should fire, and otherwise returns false.

Example:

```typescript
let onRightClick = onClick.filter(e => e.mouseButton === 'right');
onRightClick.listen(myListener);
// or
onClick.filter(e => e.mouseButton === 'right').listen(myListener);
// or maybe
let args = await onClick.filter(e => e.mouseButton === 'right').next();
```

After the second example, to remove `myListener`, you can simply unlisten to the parent event:

``` typescript
onClick.unlisten(myListener);
```

#### `SingleEvent#map<B>(transform)`

Returns a child of this event that will be fired whenever its parent is fired.
The argument passed to the listeners of the child event will be the result of the original argument being passed to a given transformation function.

It takes one parameter:

- `transform`: A function of the form `(args: A) => B` that returns the value that will be passed to the child event's listeners.

Example:

```typescript
let onValueChange = onInput.map(e => e.target.value);
// or
function processString(s) { /* ... */ }
onInput.map(e => e.target.value).listen(processString);
// or maybe
let nextString = await onInput.map(e => e.target.value).next();
processString(nextString);
```

#### `SingleEvent#take(count)`

Similarly to `SingleEvent#next`, this method returns a `Promise`.
After the event has been fired the specified number of times, the promise will be fulfilled with an array containing the arguments for each time the event was fired.

Example:

```typescript
// suppose onReadLine is fired for every line in a file
// read the first six lines:
let lines = await onReadLine.take(6);
```

### Class Example

Below is an example of how one might use a SingleEvent in a TypeScript class.

```typescript
import singleEvent, { SingleEvent } from 'single-event';

class SearchBox {
    public readonly onInput: SingleEvent<string>;

    private _input: HTMLInputElement;

    constructor(input: HTMLInputElement) {
        this._input = input;

        // a SingleEvent that uses a DOM event as an argument
        let event: SingleEvent<Event>;

        // trigger may be a local variable or a private field to allow other classes to listen to
        // the event without exposing the capability to fire the event.
        let trigger: (e: Event) => void;
        
        // Listen to the DOM event only when this object's onInput event is listened to.
        // This would allow the garbage collector to pick up this class instance when it's no
        // longer needed.
        [event, trigger] = singleEvent<Event>(
            this,
            () => this._input.addEventListener('input', trigger),
            () => this._input.removeEventListener('input', trigger),
        );

        // preprocess the search string and don't fire when the string is empty.
        this.onInput = event
            .map(e => (e.srcElement as HTMLInputElement).value.toLowerCase())
            .filter(s => s.length !== 0);
    }
}

let searchBox = new SearchBox(document.querySelector('#mySearchBox') as HTMLInputElement);
searchBox.onInput.listen(doSearch);
```
