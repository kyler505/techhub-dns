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
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="pre-delivery">Pre-Delivery</TabsTrigger>
                        <TabsTrigger value="in-delivery">In Delivery</TabsTrigger>
                        <TabsTrigger value="shipping">Shipping</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pre-delivery" className="mt-4">
                        <PreDeliveryQueue />
                    </TabsContent>

                    <TabsContent value="in-delivery" className="mt-4">
                        <InDelivery />
                    </TabsContent>

                    <TabsContent value="shipping" className="mt-4">
                        <Shipping />
                    </TabsContent>

                    <TabsContent value="history" className="mt-4">
                        <PastDeliveryRuns />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
