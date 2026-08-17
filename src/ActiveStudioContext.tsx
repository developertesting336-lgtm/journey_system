import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Studio, Trainer, FranchiseNetwork } from "./types";
import { setActiveTimeZone } from "./lib/studio-time";
import {
  hasPermission as hasPermissionHelper,
  PermissionAction,
  PermissionContext,
} from "./lib/permissions";

interface ActiveStudioContextType {
  activeStudioId: string | null;
  activeStudio: Studio | null;
  setActiveStudioId: (id: string | null) => void;
  availableStudios: Studio[];
  isChangingStudio: boolean;
  setIsChangingStudio: (val: boolean) => void;
  isAdmin: boolean;
  logout: () => Promise<void>;
  hasPermission: (
    action: PermissionAction,
    context?: PermissionContext,
  ) => boolean;

  // NEW Phase 2 states
  isAuthenticated: boolean;
  setIsAuthenticated: (val: boolean) => void;
  network: FranchiseNetwork | null;
  accessibleStudioIds: string[];
}

const ActiveStudioContext = createContext<ActiveStudioContextType | undefined>(
  undefined,
);

export function ActiveStudioProvider({
  children,
  studios,
  networks = [],
  authTrainer,
  isAdmin = false,
  userEmail,
  tokenRole,
  onLogout,
}: {
  children: ReactNode;
  studios: Studio[];
  networks?: FranchiseNetwork[];
  authTrainer: Trainer | null;
  isAdmin?: boolean;
  userEmail?: string;
  tokenRole?: string;
  onLogout: () => Promise<void>;
}) {
  const [activeStudioId, setActiveStudioIdState] = useState<string | null>(
    () => {
      return localStorage.getItem("max_strength_active_studio_id");
    },
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("max_strength_authenticated") === "true";
  });
  const [isChangingStudio, setIsChangingStudio] = useState(false);

  // Expose centralized permission checker using the active trainer, studio, and loaded networks
  const hasPermission = React.useCallback(
    (action: PermissionAction, context: PermissionContext = {}) => {
      const mergedContext = {
        networks,
        studios,
        studioId: activeStudioId || undefined,
        ...context,
      };
      return hasPermissionHelper(authTrainer, action, mergedContext, tokenRole);
    },
    [authTrainer, activeStudioId, networks, studios, tokenRole],
  );

  // Derived Active Network
  const network = React.useMemo(() => {
    if (!activeStudioId || !networks.length) return null;
    return (
      networks.find((net) => net.studioIds.includes(activeStudioId)) || null
    );
  }, [activeStudioId, networks]);

  // Derived Accessible Studio IDs for Cross-Training
  const accessibleStudioIds = React.useMemo(() => {
    if (!authTrainer) return [];
    return authTrainer.accessibleStudioIds || [];
  }, [authTrainer]);

  // Restrict available studios based on centralized permissions
  const availableStudios = React.useMemo(() => {
    // If not logged in as a trainer, show all studios
    if (!authTrainer) return studios;

    // Super Admin or Founder/Overseer see all studios
    const isGlobalUser =
      isAdmin ||
      authTrainer.role === "Admin" ||
      authTrainer.role === "Founder" ||
      authTrainer.role === "Overseer";

    if (isGlobalUser) return studios;

    // Union of accessible, guest, and owned studios
    const allowedIds = new Set([
      authTrainer.primaryHomeStudioId,
      ...(authTrainer.accessibleStudioIds || []),
      ...(authTrainer.activeGuestStudioIds || []),
      ...(authTrainer.ownedStudioIds || []),
    ]);

    // Also include studios from any networks this trainer owns
    networks.forEach((n) => {
      if (
        (n.ownerIds || []).includes(authTrainer.id!) ||
        n.ownerId === authTrainer.id
      ) {
        (n.studioIds || []).forEach((id) => allowedIds.add(id));
      }
    });

    // For FranchiseOwner (Owner role) or others, only show their allowed studios plus any where they are listed as ownerId
    return studios.filter(
      (s) => (s.id && allowedIds.has(s.id)) || s.ownerId === authTrainer.id,
    );
  }, [authTrainer, studios, isAdmin]);

  const activeStudio = React.useMemo(() => {
    return studios.find((s) => s.id === activeStudioId) || null;
  }, [activeStudioId, studios]);

  // Pin all date/time rendering to the studio's own timezone rather than the
  // viewer's, so a schedule reads the same on every device. Set during render,
  // not in an effect, so the first paint is already correct.
  setActiveTimeZone(activeStudio?.timezone);

  const setActiveStudioId = (id: string | null) => {
    setActiveStudioIdState(id);
    if (id) {
      localStorage.setItem("max_strength_active_studio_id", id);
    } else {
      localStorage.removeItem("max_strength_active_studio_id");
    }
  };

  const logout = async () => {
    setActiveStudioId(null);
    setIsAuthenticated(false);
    localStorage.clear();
    await onLogout();
  };

  useEffect(() => {
    if (activeStudio && activeStudio.brandColor) {
      document.documentElement.style.setProperty(
        "--cta",
        activeStudio.brandColor,
      );
      document.documentElement.style.setProperty(
        "--color-cta",
        activeStudio.brandColor,
      );
      document.documentElement.style.setProperty(
        "--color-cta-strong",
        activeStudio.brandColor,
      );
    } else {
      document.documentElement.style.setProperty("--cta", "#F37427");
      document.documentElement.style.setProperty("--color-cta", "#F37427");
      document.documentElement.style.setProperty(
        "--color-cta-strong",
        "#E45F0F",
      );
    }
  }, [activeStudio]);

  // If the active studio is no longer in the available list, clear it
  useEffect(() => {
    if (
      activeStudioId &&
      studios.length > 0 &&
      availableStudios.length > 0 &&
      authTrainer
    ) {
      const existsInSystem = studios.some((s) => s.id === activeStudioId);
      const isAllowed = availableStudios.some((s) => s.id === activeStudioId);

      if (!existsInSystem) {
        console.warn("Active studio no longer exists in system. Clearing.");
        setActiveStudioId(null);
        return;
      }

      if (!isAllowed && authTrainer.id !== "owner-temp") {
        console.log(
          "Active studio not in available list. Potential permission change.",
        );
      }
    }
  }, [availableStudios, activeStudioId, authTrainer, studios]);

  return (
    <ActiveStudioContext.Provider
      value={{
        activeStudioId,
        activeStudio,
        setActiveStudioId,
        availableStudios,
        isChangingStudio,
        setIsChangingStudio,
        isAdmin,
        logout,
        hasPermission,
        isAuthenticated,
        setIsAuthenticated,
        network,
        accessibleStudioIds,
      }}
    >
      {children}
    </ActiveStudioContext.Provider>
  );
}

export function useActiveStudio() {
  const context = useContext(ActiveStudioContext);
  if (context === undefined) {
    throw new Error(
      "useActiveStudio must be used within an ActiveStudioProvider",
    );
  }
  return context;
}
