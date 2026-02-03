import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function Shipping() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Shipping</h1>
                <p className="text-sm text-slate-500">Track outbound shipments and handoffs.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Shipment Queue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                            No shipments in the queue.
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Upcoming Pickups</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                            No pickups scheduled.
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
