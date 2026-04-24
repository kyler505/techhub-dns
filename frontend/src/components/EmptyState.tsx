"use client";

import { FileQuestion, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface EmptyStateProps {
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

export default function EmptyState({
    title = "Nothing here yet",
    description = "There's no data to display right now.",
    actionLabel,
    onAction,
    icon,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
                {icon || <FileQuestion className="h-8 w-8 text-muted-foreground" />}
            </div>
            <h3 className="text-lg font-semibold mb-1">{title}</h3>
            <p className="text-muted-foreground max-w-sm mb-4">{description}</p>
            {onAction && actionLabel && (
                <Button onClick={onAction} className="gap-2 transition-all duration-200 hover:bg-accent/80 active:scale-95">
                    <RefreshCw className="h-4 w-4" />
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
