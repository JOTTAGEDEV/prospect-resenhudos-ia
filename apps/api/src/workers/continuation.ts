export class JobContinuation extends Error {
  constructor(
    public checkpoint: unknown,
    public progress: number,
    public delayMs = 0,
  ) {
    super("Verificação salva; continuando na próxima empresa.");
  }
}
