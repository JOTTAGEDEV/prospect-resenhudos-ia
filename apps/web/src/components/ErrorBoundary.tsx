import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="panel" role="alert">
          <h2>Não foi possível abrir esta tela.</h2>
          <p className="muted mt-3">
            Recarregue a página para tentar novamente. Seus dados já salvos
            continuam no workspace.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Recarregar página
          </Button>
        </section>
      );
    return this.props.children;
  }
}
