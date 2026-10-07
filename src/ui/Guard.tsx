// A part of the page that fails while drawing shows what failed instead of taking the whole page
// with it: Preact leaves the page blank below an uncaught render error (the owner's phone on
// 2026-10-07, home screen empty after an update). The message and stack stay on screen so they
// can be reported; the part is tried again when `retry` changes (a new screen) or on Try again.
import { Component, type ComponentChildren } from 'preact';

interface Props {
  /** What the part is, for the message: "This screen", "Settings and debug". */
  name: string;
  /** Changing it clears a caught error (the screen's route). */
  retry?: string;
  children?: ComponentChildren;
}

interface State {
  error?: unknown;
  at?: string;
}

export class Guard extends Component<Props, State> {
  override state: State = {};

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.name} failed:`, error);
    this.setState({ error, ...(this.props.retry === undefined ? {} : { at: this.props.retry }) });
  }

  override render() {
    const { error, at } = this.state;
    if (error === undefined || (at !== undefined && at !== this.props.retry)) return this.props.children;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return (
      <div class="card guard" role="alert">
        <p>
          <strong>{this.props.name} failed to show.</strong> {message}
        </p>
        {stack && (
          <details>
            <summary>Details</summary>
            <pre class="guard-stack">{stack}</pre>
          </details>
        )}
        <div class="actions">
          <button type="button" onClick={() => this.setState({ error: undefined })}>
            Try again
          </button>
          <a class="button secondary" href="#/">
            Home
          </a>
        </div>
      </div>
    );
  }
}
