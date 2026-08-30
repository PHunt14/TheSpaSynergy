'use client';

import React from 'react';
import { ClientErrorReporter, ClientErrorPayload } from '@/lib/logger/client-reporter';

/**
 * Structured Error Logging - Error Boundary Component
 *
 * A React class component that catches unhandled JavaScript errors
 * in its child component tree and reports them via ClientErrorReporter.
 * Also sets up a global unhandled promise rejection handler.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Shared reporter instance for both error boundary and rejection handler */
const reporter = new ClientErrorReporter();

/**
 * React Error Boundary class component.
 *
 * Catches render errors in the component tree and reports them
 * to the server via ClientErrorReporter.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const payload: ClientErrorPayload = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    reporter.report(payload);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Please try refreshing the page.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * UnhandledRejectionHandler component.
 *
 * A client component that sets up a global `unhandledrejection` event listener
 * to capture unhandled promise rejections and report them via ClientErrorReporter.
 *
 * Requirements: 6.2, 6.3
 */
export function UnhandledRejectionHandler({ children }: { children?: React.ReactNode }) {
  React.useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent): void {
      const reason = event.reason;

      // Convert non-Error rejection reasons to string
      const message =
        reason instanceof Error ? reason.message : String(reason);
      const stack =
        reason instanceof Error ? reason.stack : undefined;

      const payload: ClientErrorPayload = {
        message,
        stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      reporter.report(payload);
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return children ?? null;
}

export default ErrorBoundary;
