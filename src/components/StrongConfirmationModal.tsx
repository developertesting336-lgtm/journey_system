import React, { useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface StrongConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmationPhrase: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function StrongConfirmationModal({
  isOpen,
  title,
  description,
  confirmationPhrase,
  onConfirm,
  onCancel,
  isDestructive = true,
}: StrongConfirmationModalProps) {
  const [inputValue, setInputValue] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (inputValue === confirmationPhrase) {
      onConfirm();
      setInputValue("");
    }
  };

  const handleCancel = () => {
    setInputValue("");
    onCancel();
  };

  const isEnabled = inputValue === confirmationPhrase;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm sm:items-center animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-full border border-red-500/30">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div
              className={`p-3 rounded-full ${isDestructive ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"}`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button
              onClick={handleCancel}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {title}
          </h3>

          <div className="text-sm text-slate-600 dark:text-slate-300 mb-6 space-y-3">
            <p>{description}</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-6">
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 font-medium">
              To proceed, please type{" "}
              <span className="font-mono font-bold text-slate-900 dark:text-white select-all bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                {confirmationPhrase}
              </span>{" "}
              below:
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-shadow font-mono text-sm"
              placeholder={confirmationPhrase}
              autoComplete="off"
              spellCheck="false"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-3 rounded-lg font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isEnabled}
              className={`flex-1 px-4 py-3 rounded-lg font-bold flex flex-row items-center justify-center gap-2 transition-all ${
                isEnabled
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              }`}
            >
              <Trash2 className="w-4 h-4" />
              {isDestructive ? "Wipe Data" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
