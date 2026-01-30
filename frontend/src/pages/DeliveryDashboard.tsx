import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import PreDeliveryQueue from "./PreDeliveryQueue";
import InDelivery from "./InDelivery";
import Shipping from "./Shipping";
import PastDeliveryRuns from "./PastDeliveryRuns";

export default function DeliveryDashboard() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Delivery Dashboard</h1>

            <div>
                <h2 className="text-lg font-semibold tracking-tight">Operations</h2>
                <Tabs defaultValue="pre-delivery" className="w-full">
                    <TabsList className="flex w-full items-center gap-2 overflow-x-auto ios-scroll justify-start">
                        <TabsTrigger value="pre-delivery" className="flex-shrink-0">Pre-Delivery</TabsTrigger>
                        <TabsTrigger value="in-delivery" className="flex-shrink-0">In Delivery</TabsTrigger>
                        <TabsTrigger value="history" className="flex-shrink-0">History</TabsTrigger>
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

            <div>
                <h2 className="text-lg font-semibold tracking-tight">Shipping</h2>
                <div className="mt-4">
                    <Shipping />
                </div>
            </div>
        </div>
    );
}
