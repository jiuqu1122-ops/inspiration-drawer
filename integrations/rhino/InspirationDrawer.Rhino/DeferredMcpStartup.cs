namespace InspirationDrawer.Rhino;

/// <summary>Coalesces document requests until the host is ready; no Rhino/UI dependencies.</summary>
internal sealed class DeferredMcpStartup
{
    private readonly object gate = new();
    private uint pending;
    private bool running;
    private bool stopped;
    internal void Request(uint documentId) { lock (gate) { if (!stopped && documentId != 0) pending = documentId; } }
    internal bool TryBegin(bool hostReady, out uint documentId)
    {
        lock (gate)
        {
            documentId = 0;
            if (stopped || !hostReady || running || pending == 0) return false;
            running = true; documentId = pending; pending = 0; return true;
        }
    }
    internal void Complete() { lock (gate) running = false; }
    internal void Stop() { lock (gate) { stopped = true; pending = 0; } }
}
