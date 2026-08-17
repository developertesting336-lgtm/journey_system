import { useState, useEffect } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Trainer, Studio, FranchiseNetwork } from "../types";

export function useAuthInitialization() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authTrainer, setAuthTrainer] = useState<Trainer | null>(null);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [networks, setNetworks] = useState<FranchiseNetwork[]>([]);
  const [tokenRole, setTokenRole] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          let claimsRole: string | null = null;
          try {
            const idTokenResult = await u.getIdTokenResult();
            claimsRole = (idTokenResult.claims.role as string) || null;
            setTokenRole(claimsRole);
          } catch (err) {
            // Ignoring token claims error
          }

          let trainerData: Trainer | null = null;

          // Microsoft/Azure AD sign-in frequently leaves the top-level email
          // null and only exposes the address on the provider entry. The trainer
          // lookup is keyed on email, so without this fallback a valid Microsoft
          // user is treated as having no profile and sent to Request Access.
          const resolvedEmail =
            u.email ||
            u.providerData?.find((p) => p?.email)?.email ||
            null;

          if (resolvedEmail) {
            try {
              // Primary method: Lookup by email
              const trainersRef = collection(db, "trainers");
              const q = query(
                trainersRef,
                where("email", "==", resolvedEmail.toLowerCase()),
              );
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const docSnap = querySnapshot.docs[0];
                const rawData = docSnap.data();
                trainerData = {
                  id: docSnap.id,
                  ...rawData,
                  role: rawData.role || "LifeTransformer",
                } as Trainer;
              } else if (u.uid) {
                // Secondary fallback: Lookup by UID (just in case they used an auto-assigned flow previously)
                const uidDoc = await getDoc(doc(db, "trainers", u.uid));
                if (uidDoc.exists()) {
                  const rawData = uidDoc.data();
                  trainerData = {
                    id: uidDoc.id,
                    ...rawData,
                    role: rawData.role || "LifeTransformer",
                  } as Trainer;
                }
              }

              // Bootstrap the owner if they have no profile at all
              if (
                !trainerData &&
                resolvedEmail.toLowerCase() === "developertesting336@gmail.com"
              ) {
                const newTrainer: Trainer = {
                  id: u.uid,
                  fullName: "System Admin",
                  initials: "SA",
                  role: "Admin",
                  email: resolvedEmail.toLowerCase(),
                  primaryHomeStudioId: "system",
                  accessibleStudioIds: ["system"],
                  activeGuestStudioIds: [],
                };
                try {
                  await setDoc(doc(db, "trainers", u.uid), newTrainer);
                  trainerData = newTrainer;
                } catch (err) {
                  // Fallback dynamic profile if writes fail
                  trainerData = newTrainer;
                }
              }
            } catch (e) {
              console.warn("Could not fetch trainer profile.", e);
            }
          }

          setAuthTrainer(trainerData);

          try {
            const studioSnap = await getDocs(collection(db, "studios"));
            setStudios(
              studioSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Studio),
            );
          } catch (e) {
            console.warn("Could not fetch studios collection", e);
          }

          if (!trainerData) {
            setIsAuthReady(true);
            return;
          }

          try {
            const trainersSnap = await getDocs(collection(db, "trainers"));
            setTrainers(
              trainersSnap.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as Trainer,
              ),
            );
          } catch (e) {}

          try {
            const networksSnap = await getDocs(collection(db, "networks"));
            setNetworks(
              networksSnap.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as FranchiseNetwork,
              ),
            );
          } catch (e) {}
        } catch (error) {
          console.error("Auth initialization failed", error);
        }
      } else {
        setAuthTrainer(null);
        setNetworks([]);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return {
    user,
    isAuthReady,
    authTrainer,
    setAuthTrainer,
    studios,
    setStudios,
    trainers,
    setTrainers,
    networks,
    setNetworks,
    tokenRole,
    setTokenRole,
  };
}
