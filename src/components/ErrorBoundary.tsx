import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;
  declare setState: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 m-4 bg-red-50 border-2 border-red-500 rounded-lg text-red-900 font-sans z-9999 relative">
          <h1 className="text-xl font-bold mb-2">Something went wrong.</h1>
          <p className="font-mono text-sm bg-white p-2 rounded border border-red-200 whitespace-pre-wrap">
            {this.state.error?.toString()}
          </p>
          <details className="mt-2 text-xs">
            <summary>Component Stack</summary>
            <pre className="mt-2 bg-white p-2 rounded overflow-auto max-h-40">
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button 
            onClick={() => this.setState({ hasError: false })} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
