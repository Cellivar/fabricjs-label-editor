
export class ActionStack {
  public constructor(private readonly state: any[] = []) { }

  public push(val: any) { this.state.push(val); }

  public pop() { return this.state.pop(); }

  public isEmpty() { return this.state.length < 1; }

  public clear() { this.state.splice(0); }

  public current() { return this.state.at(-1); }

  public getValues() { return [...this.state]; }

  public get length() { return this.state.length; }
}

export class UndoRedoStack {
  undoStack: ActionStack;
  redoStack: ActionStack;

  public constructor(state: {
    undoStack: ActionStack,
    redoStack: ActionStack,
  } = {
    redoStack: new ActionStack(),
    undoStack: new ActionStack(),
  }) {
    this.undoStack = state.undoStack;
    this.redoStack = state.redoStack;
  }

  public push(val: any) {
    this.undoStack.push(val);
    this.redoStack.clear();
  }

  public undo() {
    // Undo holds our current state too, so it can't be emptied.
    if (this.undoStack.length > 1) {
      const op = this.undoStack.pop();
      this.redoStack.push(op);
      return this.undoStack.current();
    }
    return undefined;
  }

  public redo() {
    if (!this.redoStack.isEmpty()) {
      const op = this.redoStack.pop();
      this.undoStack.push(op);
      return op;
    }
    return undefined;
  }

  public clear() {
    this.undoStack.clear();
    this.redoStack.clear();
  }

  public latest() {
    return this.undoStack.current();
  }

  public getValues() {
    return {
      undo: this.undoStack.getValues(),
      redo: this.redoStack.getValues()
    }
  }
}
