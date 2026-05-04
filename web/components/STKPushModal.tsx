"use client";

import { useEffect, useState } from "react";
import { X, Smartphone, Shield, CheckCircle, AlertCircle } from "lucide-react";

interface STKPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  planName: string;
  planCredits: number;
  initialPhone?: string;
  onPaymentSuccess: () => void;
}

export default function STKPushModal({
  isOpen,
  onClose,
  amount,
  planName,
  planCredits,
  initialPhone,
  onPaymentSuccess,
}: STKPushModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone ?? "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "sent" | "success" | "failed"
  >("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setPaymentStatus("idle");
    setIsProcessing(false);
    setError("");
    setPhoneNumber(initialPhone ?? "");
  }, [isOpen, initialPhone]);

  if (!isOpen) return null;

  const formatPhoneNumber = (phone: string) => {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = "254" + cleaned.substring(1);
    if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
    return cleaned;
  };

  const validatePhoneNumber = (phone: string) => {
    const formatted = formatPhoneNumber(phone);
    return formatted.length === 12 && formatted.startsWith("254");
  };

  const handleSTKPush = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      setError(
        "Please enter a valid Kenyan Safaricom number (e.g. 0712345678).",
      );
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      const response = await fetch("/api/payments/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          amount,
          planName,
          planCredits,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Failed to initiate payment.",
        );
      }

      if (typeof result.safaricomInitHint === "string" && result.safaricomInitHint) {
        console.info("[mpesa] Daraja initiation hint:", result.safaricomInitHint);
      }

      const checkout =
        typeof result.checkoutRequestID === "string"
          ? result.checkoutRequestID
          : "";
      if (!checkout) {
        throw new Error("No checkout ID returned from payment service.");
      }

      setPaymentStatus("sent");
      pollPaymentStatus(checkout);
    } catch (err) {
      console.error("STK Push error:", err);
      setError(
        err instanceof Error ? err.message : "Payment failed. Please try again.",
      );
      setPaymentStatus("failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const pollPaymentStatus = async (checkoutRequestID: string) => {
    const maxAttempts = 45;
    let attempts = 0;
    let networkRetries = 0;
    const maxNetworkRetries = 40;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/payments/check-status?checkoutRequestID=${encodeURIComponent(checkoutRequestID)}`,
        );
        const result = await response.json();
        networkRetries = 0;

        if (result.status === "SUCCESS") {
          setPaymentStatus("success");
          setTimeout(() => {
            onPaymentSuccess();
            onClose();
          }, 1800);
        } else if (
          result.status === "FAILED" ||
          result.status === "CANCELLED" ||
          result.status === "NOT_FOUND"
        ) {
          if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
            console.warn("[mpesa] check-status FAILED/NOT_FOUND", result);
          }
          setPaymentStatus("failed");
          setError(result.message ?? "Payment was cancelled or failed.");
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 6000);
        } else {
          setPaymentStatus("failed");
          setError(
            "Verification timed out. If you entered your PIN successfully, Premium may still activate shortly — refresh the home page.",
          );
        }
      } catch (err) {
        console.error("Status check error:", err);
        const likelyDevServerDown =
          err instanceof TypeError ||
          (typeof err === "object" &&
            err !== null &&
            "message" in err &&
            String((err as Error).message).toLowerCase().includes("fetch"));

        if (likelyDevServerDown && networkRetries < maxNetworkRetries) {
          networkRetries++;
          const backoffMs = Math.min(
            12_000,
            Math.round(1500 * Math.pow(1.45, Math.min(networkRetries - 1, 8))),
          );
          if (networkRetries === 1 || networkRetries % 5 === 0) {
            console.warn(
              `[mpesa] check-status unreachable (${networkRetries}/${maxNetworkRetries}) — if on localhost keep "npm run dev" running.`,
            );
          }
          setTimeout(poll, backoffMs);
          return;
        }

        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 6000);
        } else {
          setPaymentStatus("failed");
          setError(
            "Lost connection while checking payment. Keep the dev server running (npm run dev), then reopen checkout or refresh home — the payment may still complete.",
          );
        }
      }
    };

    poll();
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    setError("");
  };

  const resetClosed = () => {
    setPhoneNumber(initialPhone ?? "");
    setPaymentStatus("idle");
    setError("");
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetClosed();
    onClose();
  };

  const showCredits = planCredits > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stk-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-birgen-border bg-birgen-card shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-birgen-border">
          <div>
            <p className="text-birgen-red font-bold text-[10px] uppercase tracking-[0.2em] mb-2">
              M-PESA
            </p>
            <h2 id="stk-modal-title" className="font-display text-2xl text-white tracking-wide">
              Complete payment
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-birgen-muted hover:text-white hover:bg-birgen-dark transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-lg border border-birgen-red/35 bg-gradient-to-br from-birgen-red/10 to-transparent p-4 mb-6">
            <p className="text-birgen-silver text-xs leading-snug">{planName}</p>
            <div className="flex justify-between items-baseline mt-3 gap-2">
              <div>
                <p className="text-white text-[11px] uppercase tracking-wide text-birgen-muted mb-1">
                  Total due
                </p>
                <p className="text-3xl font-bold text-white tracking-tight">
                  KSh {amount.toLocaleString()}
                </p>
              </div>
              {showCredits && (
                <p className="text-birgen-muted text-sm font-medium">
                  {planCredits.toLocaleString()} credits
                </p>
              )}
            </div>
          </div>

          {paymentStatus === "idle" && (
            <>
              <label
                htmlFor="stk-mpesa-phone"
                className="block text-sm font-medium text-birgen-silver mb-2"
              >
                Phone number (Safaricom)
              </label>
              <div className="relative mb-5">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-birgen-muted" />
                <input
                  id="stk-mpesa-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneNumberChange}
                  placeholder="0712345678"
                  className={`w-full pl-11 pr-3 py-3 rounded-lg bg-birgen-dark border text-white placeholder:text-birgen-muted focus:outline-none focus:ring-2 focus:ring-birgen-red/50 ${
                    error ? "border-red-500/60" : "border-birgen-border"
                  }`}
                />
              </div>

              {error && <p className="text-red-400 text-xs -mt-4 mb-4">{error}</p>}

              <div className="rounded-lg border border-birgen-border bg-birgen-dark/70 p-3 mb-6">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-birgen-red shrink-0 mt-0.5" />
                  <p className="text-birgen-silver text-xs leading-relaxed">
                    You&apos;ll receive a secure STK Push on your phone. Enter your M-PESA PIN to
                    authorize <span className="text-white font-semibold">KSh {amount}</span>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSTKPush}
                disabled={isProcessing || !phoneNumber.trim()}
                className="w-full py-3 px-4 rounded-md bg-birgen-red hover:bg-birgen-red-light focus:outline-none focus:ring-2 focus:ring-birgen-red disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Sending request…
                  </>
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" />
                    Pay KSh {amount.toLocaleString()}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full mt-3 py-2.5 px-4 rounded-md border border-birgen-border text-birgen-silver hover:text-white hover:bg-birgen-dark text-sm transition-colors font-semibold"
              >
                Cancel
              </button>
            </>
          )}

          {paymentStatus === "sent" && (
            <div className="text-center py-2">
              <div className="animate-pulse mb-6 flex justify-center">
                <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-birgen-red/15 border border-birgen-red/40">
                  <Smartphone className="h-8 w-8 text-birgen-red" />
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Check your phone</h3>
              <p className="text-birgen-silver text-sm mb-1">
                We sent an STK prompt to{" "}
                <span className="text-white font-semibold">{phoneNumber}</span>
              </p>
              <p className="text-birgen-muted text-xs">
                Waiting for PIN confirmation…
              </p>
              <div className="mt-6 flex justify-center">
                <span className="animate-spin rounded-full h-8 w-8 border-2 border-birgen-red border-t-transparent" />
              </div>
            </div>
          )}

          {paymentStatus === "success" && (
            <div className="text-center py-2">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">
                Welcome to Premium
              </h3>
              <p className="text-birgen-silver text-sm">
                Redirecting you home…
              </p>
            </div>
          )}

          {paymentStatus === "failed" && (
            <div className="text-center py-2">
              <AlertCircle className="h-14 w-14 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Payment not completed</h3>
              <p className="text-birgen-silver text-sm mb-5">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setPaymentStatus("idle");
                  setError("");
                }}
                className="rounded-md bg-birgen-red px-6 py-2.5 font-bold text-white text-sm hover:bg-birgen-red-light transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
