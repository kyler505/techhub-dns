export default function Shipping() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Shipping</h1>
                <p className="text-sm text-muted-foreground">Track shipment work without the dashboard-box feel.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none lg:col-span-2">
                    <div className="space-y-2 border-b border-border/60 pb-4">
                        <h2 className="text-base font-semibold tracking-tight">Shipment Queue</h2>
                        <p className="text-sm text-muted-foreground">Current shipments waiting to be processed.</p>
                    </div>
                    <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
                        No shipments in the queue.
                    </div>
                </section>

                <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-none">
                    <div className="space-y-2 border-b border-border/60 pb-4">
                        <h2 className="text-base font-semibold tracking-tight">Upcoming Pickups</h2>
                        <p className="text-sm text-muted-foreground">Planned pickups and handoff timing.</p>
                    </div>
                    <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
                        No pickups scheduled.
                    </div>
                </section>
            </div>
        </div>
    );
}
