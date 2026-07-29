import { useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Trainer } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useTrainers(
  isReady: boolean,
  setTrainers: (trainers: Trainer[]) => void,
) {
  useEffect(() => {
    if (!isReady) return;

    const unsubscribeTrainers = onSnapshot(
      collection(db, "trainers"),
      (snap) => {
        const loaded = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Trainer,
        );
        loaded.sort((a, b) => {
          const orderA = typeof a.order === "number" ? a.order : 999999;
          const orderB = typeof b.order === "number" ? b.order : 999999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.fullName || "").localeCompare(b.fullName || "");
        });
        setTrainers(loaded);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "trainers");
      },
    );

    return () => unsubscribeTrainers();
  }, [isReady, setTrainers]);
}
