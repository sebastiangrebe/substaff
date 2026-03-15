import { useEffect, useState } from "react";

const STATUS_MESSAGES = [
  "Loading your workspace…",
  "Connecting to agents…",
  "Syncing team state…",
  "Almost there…",
];

export function AppLoader() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="app-loader-glow app-loader-glow--primary" />
        <div className="app-loader-glow app-loader-glow--secondary" />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 app-loader-grid pointer-events-none" />

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-6">
        {/* Logo mark with pulse ring */}
        <div className="relative flex items-center justify-center">
          {/* Outer pulse rings */}
          <div className="absolute h-20 w-20 rounded-full border border-primary/10 app-loader-ring app-loader-ring--1" />
          <div className="absolute h-28 w-28 rounded-full border border-primary/5 app-loader-ring app-loader-ring--2" />

          {/* Logo container with glow */}
          <div className="relative h-14 w-14 flex items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-primary/10 blur-xl app-loader-logo-glow" />
            <svg
              width="40"
              height="40"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="relative app-loader-logo"
            >
              <path
                d="M16 12V18M16 12L9 20M16 12L23 20"
                stroke="currentColor"
                className="text-primary"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="9" r="3.5" className="fill-primary" />
              <circle
                cx="9"
                cy="22"
                r="3"
                className="fill-primary/50 app-loader-node app-loader-node--1"
              />
              <circle
                cx="16"
                cy="22"
                r="3"
                className="fill-primary/50 app-loader-node app-loader-node--2"
              />
              <circle
                cx="23"
                cy="22"
                r="3"
                className="fill-primary/50 app-loader-node app-loader-node--3"
              />
            </svg>
          </div>
        </div>

        {/* Brand name */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground app-loader-fade-in app-loader-fade-in--1">
            Substaff
          </h1>

          {/* Loading bar */}
          <div className="w-36 h-0.5 rounded-full bg-muted overflow-hidden app-loader-fade-in app-loader-fade-in--2">
            <div className="h-full rounded-full bg-primary/60 app-loader-bar" />
          </div>

          {/* Rotating status message */}
          <p
            key={messageIndex}
            className="text-xs text-muted-foreground app-loader-message"
          >
            {STATUS_MESSAGES[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
