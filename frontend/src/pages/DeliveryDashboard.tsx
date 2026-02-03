import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import PreDeliveryQueue from "./PreDeliveryQueue";
import InDelivery from "./InDelivery";
import PastDeliveryRuns from "./PastDeliveryRuns";

export default function DeliveryDashboard() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Delivery Dashboard</h1>

            <div>
                <Tabs defaultValue="pre-delivery" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="pre-delivery" className="w-full text-center">Pre-Delivery</TabsTrigger>
                        <TabsTrigger value="in-delivery" className="w-full text-center">In Delivery</TabsTrigger>
                        <TabsTrigger value="history" className="w-full text-center">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pre-delivery" className="mt-4">
                        <PreDeliveryQueue />
                    </TabsContent>

                    <TabsContent value="in-delivery" className="mt-4">
                        <InDelivery />
                    </TabsContent>

                    <TabsContent value="history" className="mt-4">
                        <PastDeliveryRuns />
                    </TabsContent>
                </Tabs>
            </div>

        </div>
    );
}
