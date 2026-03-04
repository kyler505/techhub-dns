import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function Shipping() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="rounded-xl border border-maroon-900/10 bg-gradient-to-br from-maroon-50 via-background to-background p-5 sm:p-6 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-maroon-700">Shipping Operations</div>
                <h1 className="text-2xl font-bold tracking-tight">Shipping</h1>
                <p className="text-sm text-muted-foreground">Track queue readiness and coordinate outbound pickups.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-maroon-900/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Shipment Queue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-maroon-900/20 bg-maroon-50/30 text-sm text-slate-500">
                            No shipments in the queue.
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-maroon-900/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Upcoming Pickups</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-maroon-900/20 bg-maroon-50/30 text-sm text-slate-500">
                            No pickups scheduled.
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
