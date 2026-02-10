import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";

interface CreateDeliveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDelivery: (vehicle: string) => Promise<void>;
  selectedOrdersCount: number;
}

export default function CreateDeliveryDialog({
  isOpen,
  onClose,
  onCreateDelivery,
  selectedOrdersCount,
}: CreateDeliveryDialogProps) {
  const [vehicle, setVehicle] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehicle) {
      toast.error("Please select a vehicle");
      return;
    }

    setIsLoading(true);
    try {
      await onCreateDelivery(vehicle);
      setVehicle("");
      onClose();
    } catch (error) {
      console.error("Failed to create delivery:", error);
      toast.error("Failed to start delivery");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setVehicle("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start Delivery</DialogTitle>
          <DialogDescription>
            Create a delivery run for {selectedOrdersCount} selected order{selectedOrdersCount !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="vehicle" className="text-right">
                Vehicle
              </label>
              <select
                id="vehicle"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              >
                <option value="">Select a vehicle</option>
                <option value="van">Van</option>
                <option value="golf_cart">Golf Cart</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Starting..." : "Start Delivery"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
