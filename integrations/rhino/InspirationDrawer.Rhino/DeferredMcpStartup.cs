namespace InspirationDrawer.Rhino;

/// <summary>Coalesces document requests and deduplicates successful/in-flight warmup.</summary>
internal sealed class DeferredMcpStartup
{
    private readonly object gate = new();
    private uint pending, runningDocument, completedDocument;
    private bool stopped;
    internal void Request(uint documentId)
    {
        lock (gate)
        {
            if (stopped || documentId == 0) return;
            // ActiveDocumentChanged/NewDocument/panel creation can all report the same document.
            // A request back to the running document supersedes an intermediate document switch.
            pending = documentId == runningDocument || (runningDocument == 0 && documentId == completedDocument) ? 0 : documentId;
        }
    }
    internal bool TryBegin(bool hostReady, out uint documentId)
    {
        lock (gate)
        {
            documentId = 0;
            if (stopped || !hostReady || runningDocument != 0 || pending == 0) return false;
            runningDocument = documentId = pending; pending = 0; return true;
        }
    }
    internal void Complete(bool success = true)
    {
        lock (gate)
        {
            if (success && runningDocument != 0) completedDocument = runningDocument;
            runningDocument = 0;
        }
    }
    internal void Stop() { lock (gate) { stopped = true; pending = 0; } }
}
