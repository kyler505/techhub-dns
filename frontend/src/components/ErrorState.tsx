"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface ErrorStateProps {
    title?: string;
    message?: string;
    retryLabel?: string;
    onRetry?: () => void;
}

export default function ErrorState({
    title = "Something went wrong",
    message = "We couldn't load the content. Please try again.",
    retryLabel = "Retry",
    onRetry,
}: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{title}</h3>
            <p className="text-muted-foreground max-w-sm mb-4">{message}</p>
            {onRetry && (
                <Button variant="outline" onClick={onRetry} className="gap-2 transition-all duration-200 hover:bg-accent/80 active:scale-95">
                    <RefreshCw className="h-4 w-4" />
                    {retryLabel}
                </Button>
            )}
        </div>
    );
}
