import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, message: null });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border bg-card p-6 space-y-4 text-center">
          <h1 className="text-xl font-bold">Ocurrió un problema al cargar la página</h1>
          <p className="text-sm text-muted-foreground">
            Puedes volver al inicio o recargar. Este error ya fue registrado en consola.
          </p>
          {this.state.message && (
            <p className="text-xs text-muted-foreground break-words">Detalle: {this.state.message}</p>
          )}
          <div className="flex gap-2 justify-center">
            <Button asChild variant="secondary">
              <Link to="/">Ir al inicio</Link>
            </Button>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        </div>
      </div>
    );
  }
}
