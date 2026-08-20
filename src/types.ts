/**
 * Roles defining system access levels across the organization.
 */
export type UserRole =
  | "Admin"
  | "Founder"
  | "Owner"
  | "StudioLeader"
  | "LifeTransformer"
  | "FranchiseOwner"
  | "Overseer"
  | "StudioOwner"
  | "HeadTrainer"
  | "Trainer";

export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: "System Administrator",
  Founder: "Founder / Overseer",
  Owner: "Franchise Owner",
  StudioLeader: "Studio Leader",
  LifeTransformer: "Life Transformer",
  // Legacy mappings
  FranchiseOwner: "Franchise Owner",
  Overseer: "Founder / Overseer",
  StudioOwner: "Franchise Owner",
  HeadTrainer: "Studio Leader",
  Trainer: "Life Transformer",
};

export type RPE = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ClinicalTagDefinition {
  id: string;
  kind: "Form" | "Symptom" | "Behavior";
  machineId?: string;
  region?: "Upper" | "Lower" | "Core" | "Spine" | "Systemic";
  label: string;
  cue?: string;
  fourPCategory?: "Posture" | "Pace" | "Path" | "Purpose";
}

export type SleepQuality = "poor" | "average" | "optimal";
export type BodyRegionState = "stiff" | "prime";

export interface BodyStateTag {
  /** Free string at the type boundary so legacy data validates.
   *  New UI enforces the BODY_REGIONS enum at the picker. */
  region: string;
  state: BodyRegionState;
  /** Reserved for future intensity grading. */
  intensity?: 1 | 2 | 3;
}

export interface PreSessionCheckIn {
  /** @deprecated Use `sleepQuality`. Retained for legacy session reads. */
  sleepHours?: number;
  /** @deprecated Use `bodyStates`. Retained for legacy session reads. */
  sorenessLevel?: 1 | 2 | 3 | 4 | 5;
  /** @deprecated Use `bodyStates`. Retained for legacy session reads. */
  sorenessRegions?: string[];

  /** Qualitative sleep signal. `undefined` = trainer did not capture. */
  sleepQuality?: SleepQuality;

  /** Per-region body state tags. `undefined` = not captured;
   *  `[]` = trainer affirmatively reviewed and recorded nothing. */
  bodyStates?: BodyStateTag[];

  stressLevel?: 1 | 2 | 3 | 4 | 5;
  hydration?: "low" | "ok" | "good";
  note?: string;
}

export type ClientFeel = "Wiped Out" | "Good" | "Energized";

export interface ClinicalIncident {
  id?: string;
  clientId: string;
  studioId: string;
  sessionId?: string;
  machineId?: string;
  region: string;
  severity: "mild" | "moderate" | "stop_session";
  description: string;
  actionTaken?: string;
  resolvedAt?: any;
  surfaceUntil?: any;
  reportedByTrainerId: string;
  createdAt: any;
}

/**
 * Represents a group of studios owned by a Studio Owner or managed as a region.
 */
export interface FranchiseNetwork {
  id: string;
  name: string;
  ownerId?: string; // Legacy
  ownerIds?: string[]; // Multiple Owners
  state?: string; // e.g. "Ohio"
  studioIds: string[]; // List of Studio IDs included in this network
  createdAt?: any;
}

export interface Network {
  id: string;
  name: string;
  ownerId: string;
  studioIds: string[];
}

/**
 * Represents the top-level entity owning one or more studios.
 */
export interface Owner {
  id: string;
  name: string;
  email: string;
  /** IDs of studios owned by this entity for relational mapping */
  ownedStudioIds: string[];
}

export interface TrainerAvailability {
  standard: {
    [day: string]: { isOpen: boolean; slots: { start: string; end: string }[] };
  };
  overrides?: {
    [date: string]: {
      isOpen: boolean;
      slots: { start: string; end: string }[];
    };
  };
}

/**
 * TRAINER & STAFF PROFILES
 * Trainers are assigned to home locations but can be granted guest access elsewhere.
 */
export interface Trainer {
  id: string;
  fullName: string;
  nickname?: string;
  initials: string;
  brandColor?: string;
  mindbodyLinked?: boolean;
  pin?: string;
  pinHash?: string;
  requiresPinReset?: boolean;
  role: UserRole;
  ownedStudioIds?: string[];
  primaryHomeStudioId: string;
  accessibleStudioIds: string[];
  activeGuestStudioIds: string[];
  bio?: string;
  email?: string;
  thirdPartyCalendarUrl?: string;
  certifications?: string[];
  employmentStartDate?: any;
  availability?: TrainerAvailability;
  mindbodyStaffId?: string;
  mindbody_ical_url?: string;
  legacy_filemaker_id?: string;
  createdAt?: any;
  order?: number;
  isVisibleOnCalendar?: boolean;
  searchTokens?: string[];
}

export type NewTrainerPayload = CreateTrainerPayload;

/**
 * Payload utilized for creating a new Trainer/Staff record.
 * Crucially excludes any ID field to avoid creation of orphan references.
 */
export interface CreateTrainerPayload {
  fullName: string;
  initials: string;
  pin?: string;
  pinHash?: string;
  requiresPinReset?: boolean;
  role?: UserRole;
  email?: string;
  primaryHomeStudioId: string;
  accessibleStudioIds: string[];
  activeGuestStudioIds?: string[];
  isVisibleOnCalendar?: boolean;
  searchTokens?: string[];
  isOwner?: boolean; // Help modal switch mapping to owner role
  systemStatus?: "active" | "inactive";
}

/**
 * Payload utilized for updating a Trainer/Staff record.
 */
export interface UpdateTrainerPayload {
  fullName?: string;
  nickname?: string;
  email?: string;
  role?: UserRole;
  initials?: string;
  brandColor?: string;
  mindbodyLinked?: boolean;
  pin?: string;
  pinHash?: string;
  primaryHomeStudioId?: string;
  accessibleStudioIds?: string[];
  activeGuestStudioIds?: string[];
  isVisibleOnCalendar?: boolean;
  searchTokens?: string[];
  systemStatus?: "active" | "inactive";
  ownedStudioIds?: string[];
  bio?: string;
  thirdPartyCalendarUrl?: string;
  certifications?: string[];
  mindbodyStaffId?: string;
  mindbody_ical_url?: string;
  order?: number;
}

export interface ClientEvent {
  id: string;
  date: string; // Start date
  endDate?: string; // End date for block events
  title: string;
  type:
    | "Progress Report"
    | "InBody Scan"
    | "Routine Change"
    | "Vacation"
    | "Birthday/Anniversary"
    | "Other"
    | "Medical"
    | "Snowbird"
    | "Alert";
  priority: "High" | "Medium" | "Low";
  notes?: string;
  createdAt?: any;
}

export interface ClinicalSafetyFlag {
  id: string;
  category: string;
  conditionName: string;
  label?: string;
  severity: string;
  protocolHandling: {
    instruction: string;
    affectedMachineIds: string[];
    setupModification?: string;
  }[];
}

export interface CurrentMachineMetric {
  weight: string;
  reps?: string;
  seconds?: string;
  isStaticHold?: boolean;
  isTSC?: boolean;
  totalTimeUnderLoad?: number;
  averageTimePerRep?: number;
  settings: Record<string, string>;
  lastPerformedDate: any;
  lastPerformedSessionNumber?: number;
  lastSessionId?: string;
}

export interface ClientRetentionMeta {
  excludedFromMIA?: boolean;
  excludedReason?: string;
  excludedBy?: string; // Trainer ID or Name
  autoIncludeAfter?: any; // Timestamp or string Date
  lastContactedDate?: any; // Timestamp or string Date
}

export interface Client {
  id?: string;
  mindbodyId?: string;
  mindbodyClientId?: string;
  photoUrl?: string;
  /** MANDATORY: The studio where the client is billed and primarily trains */
  homeStudioId: string;
  approvedCrossTrainStudioIds?: string[]; // Studio IDs where cross-training is explicitly approved
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: "Male" | "Female" | "Other" | string;
  height: string; // e.g., "5'10\""
  weight?: string;
  age?: number;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  isActive: boolean;
  medicalHistory?: string;
  occupation?: string;
  isRetired?: boolean;
  experienceLevel?: "Beginner" | "Intermediate" | "Advanced" | string;
  clinicalProfile?: string[];
  clinicalFlags?: string[];
  clinicalNotes?: string;
  activityLevel?: "Sedentary" | "Light" | "Moderate" | "High" | "Manual Labor";
  trainingPedigree?:
    | "Novice"
    | "Intermediate"
    | "Advanced"
    | "Protocol Veteran";
  recoveryMetric?: "Poor" | "Average" | "Optimal";
  activity?: string;
  goals?: string;
  globalNotes?: string;
  leadSource?: string;
  referredBy?: string;
  notes?: string;
  events?: ClientEvent[];
  isRoutineBActive?: boolean;
  preferredTodayRoutineId?: string;
  remainingSessions: number;
  legacy_filemaker_id?: string;
  mindbody_name?: string;
  completedSessions?: number;
  sessionCount?: number;
  lifetimeReps?: number;
  lifetimeWeight?: number;
  packageTier?: "6-Month" | "12-Month" | "18-Month" | "None";
  consultationCompleted?: boolean;
  requiresConsultation?: boolean;
  firstSessionDate?: any;
  discoveryNotes?: string;
  currentMachineMetrics?: Record<string, CurrentMachineMetric>;
  createdAt?: any;
  retentionMeta?: ClientRetentionMeta;
}

export interface Machine {
  id?: string;
  name: string;
  fullName?: string;
  settings?: string; // Repurposed as "Standard Setup Tips"
  trainerTips?: string;
  settingOptions?: string[]; // e.g. ["Seat", "Pads", "Backrest"]
  targetRepRange?: string;
  standardSettings?: Record<string, string>; // e.g. {"Seat": "5", "Pads": "2"}
  standardWeights?: {
    Beginner?: number | string;
    Intermediate?: number | string;
    Advanced?: number | string;
  };
  order?: number;
  imageUrl?: string;
  anatomicalRegion?: string;
  kinematicClassification?: string;
  targetMuscles?: string | string[]; // Muscle group names or short desc
  primaryMuscles?: string[];
  targetMusculature?: string[];
  synergists?: string[];
  setupGap?: string;
  executionPosture?:
    | "Chest Up / Anterior Pelvic Tilt"
    | "Posterior Pelvic Tilt / Contracted Abdomen"
    | string;
  requiresHandoff?: boolean;
  sequencingContraindications?: string[];
  biomechanicalNotes?: string;
  contraindicatedFor?: string[];
  modifications?: string;
  muscleImageUrl?: string; // Image showing targeted muscles
  formVideoUrl?: string;
  cueingTips?: string; // Peer-to-peer trainer tips
  deepDiveNotes?: string;
}

export interface MachineSettingChange {
  studioId?: string;
  id?: string;
  machineId: string;
  clientId: string;
  trainerId: string;
  previousSettings: Record<string, string>;
  newSettings: Record<string, string>;
  reason?: string;
  createdAt: any;
}

export interface Routine {
  studioId?: string;
  id?: string;
  clientId: string;
  name: string;
  machineIds: string[];
  machineNotes?: Record<string, string>; // Machine ID -> Routine-specific Note
  createdAt?: any;
  updatedAt?: any;
}

export interface RoutineAdjustment {
  studioId?: string;
  id?: string;
  routineId: string;
  clientId: string;
  previousMachineIds: string[];
  newMachineIds: string[];
  trainerId: string;
  notes?: string;
  createdAt: any;
  changeType?: "created" | "machines" | "enabled" | "disabled";
}

export type SessionType = "Standard" | "Onboarding" | "Reset";

export interface WorkoutSession {
  id?: string;
  clientId?: string;
  routineId?: string;
  /** PHYSICAL LOCATION: Where the workout actually took place */
  hostedAtStudioId: string;
  /** DATA ANCHOR: The client's home base (used for local reporting vs cross-studio usage) */
  clientHomeStudioId: string;
  /** Flag for sessions performed at a non-home studio location */
  isCrossTrain: boolean;
  sessionType: SessionType;
  sessionNumber: number;
  date: string;
  trainerInitials: string;
  trainerId?: string;
  mindbodyClientId?: string;
  clientName?: string;
  /** Who originally initiated the session document (Soft Lock Architecture) */
  startedByTrainerId?: string;
  /** Activity checkpoint updated during logs to detect abandonment (Lazy Cleanup) */
  lastHeartbeatAt?: any;
  notes?: string; // Original notes field (deprecated in favor of sub-collection)
  clientFeel?: ClientFeel | string;
  preSessionCheckIn?: PreSessionCheckIn;
  postFeel?: {
    physical: 1 | 2 | 3 | 4 | 5;
    mental: 1 | 2 | 3 | 4 | 5;
    overallRPE?: RPE;
  };
  startTime?: any;
  endTime?: any;
  /** Client-clock start, used while `startTime`'s serverTimestamp() is pending. */
  clientStartTime?: string;
  /** When the current pause began; null/absent while the session is running. */
  pausedAt?: any;
  /** Milliseconds accumulated across completed pauses. */
  totalPausedMs?: number;
  status: "In-Progress" | "Completed";
  clientAge?: number;
  clientOccupation?: string;
  clientIsRetired?: boolean;
  clientActivityLevel?: string;
  clientClinicalProfile?: string[];
  legacy_filemaker_id?: string;
  legacy_notes?: string;
  createdAt?: any;
}

export interface SessionNote {
  studioId?: string;
  id?: string;
  sessionId: string;
  clientId?: string;
  trainerId?: string;
  trainerInitials: string;
  content: string;
  priority?: "High" | "Medium" | "Low";
  createdAt: any;
}

export type RepQuality = 1 | 2 | 3;

export interface ExerciseLog {
  studioId?: string;
  homeStudioId?: string;
  clientHomeStudioId?: string;
  id?: string;
  sessionId: string;
  clientId?: string;
  machineId: string;
  suggestedOrder?: number;
  weight?: string;
  reps?: string;
  loadLb?: string;
  outcomeTut?: string;
  outcomeReps?: string;
  repsLeft?: number;
  repsRight?: number;
  seconds?: string;
  targetWeight?: string;
  isStaticHold?: boolean;
  isTSC?: boolean;
  repQuality?: RepQuality;
  timeSpent?: string;
  totalTimeUnderLoad?: number;
  averageTimePerRep?: number;
  machineStartedAt?: any;
  machineDurationSeconds?: number;
  side?: "Left" | "Right";
  notes?: string;
  machineSettings?: Record<string, string>; // Settings used for this specific set
  createdAt?: any;
  updatedAt?: any;
  rpe?: RPE;
  rpeNote?: string;
  eccentricSeconds?: number;
  concentricSeconds?: number;
  pauseSeconds?: number;
  clinicalTags?: string[];
  symptoms?: {
    region: string;
    intensity: 1 | 2 | 3 | 4 | 5;
    onsetRep?: number;
    note?: string;
  }[];
  setupReason?:
    | "client_self_set"
    | "trainer_fix"
    | "protocol_progression"
    | "comfort_adjust";
  setupWasCorrect?: boolean;
}

export interface MachineNote {
  id?: string;
  content: string;
  authorId?: string;
  authorName: string;
  timestamp: any;
  isImportant: boolean;
}

export interface SettingsHistoryEntry {
  settings: Record<string, string>;
  updatedBy: string;
  updatedAt: any;
  reason?: string;
}

export interface ClientMachineSetting {
  studioId?: string;
  id?: string;
  clientId: string;
  machineId: string;
  settings: Record<string, string>;
  updatedBy: string;
  updatedAt: any;
  notes?: string;
  machineNotes?: MachineNote[];
  settingsHistory?: SettingsHistoryEntry[];
  startingWeight?: number;
  startingWeightDate?: any;
  currentWeight?: number;
}

export interface ScheduleEntry {
  id?: string;
  clientId?: string;
  clientName: string;
  trainerId?: string;
  trainerName: string;
  studioId: string;
  startTime: any;
  endTime: any;
  status: "Scheduled" | "Completed" | "Cancelled" | "No-Show";
  serviceName: string;
  source: "MindBody" | "Manual" | "Subscription";
  importId?: string;
  ical_uid?: string;
  createdAt: any;
}

export type HighlightMetricType =
  | "strength_gain"
  | "total_volume"
  | "consistent_quality"
  | "time_under_tension"
  | "custom";

export interface ProgressReport {
  studioId?: string;
  id?: string;
  clientId: string;
  trainerId: string;
  trainerName: string;
  trainerInitials?: string;
  sessionNumber?: number;
  date: string;
  isManual?: boolean;
  status: "Draft" | "Finalized";

  // Step 1: Attendance & Consistency
  attendance: {
    score: number; // 0-100
    totalSessions: number;
    avgDuration: number;
    punctuality: string; // e.g., "Generally early"
    narrative: string; // "Great job showing up..."
    firstSessionDate?: string;
    totalVolume?: number;
    totalReps?: number;
    totalGoodReps?: number;
    avgRestDays?: number;
    toggles?: {
      totalSessions: boolean;
      totalVolume: boolean;
      totalReps: boolean;
      totalGoodReps?: boolean;
      avgRestDays: boolean;
      avgDuration: boolean;
    };
    customStartDate?: string;
  };

  // Step 2: Highlighted Movements (Measurable Progress)
  highlights: {
    machineId?: string;
    label: string;
    metricType?: HighlightMetricType;
    startValue?: string;
    currentValue?: string;
    percentageIncrease?: number;
    totalVolume?: number;
    perfectSets?: number;
    timeUnderTension?: number;
    customText?: string;
    narrative?: string;
  }[];

  // Step 3: The Four P's
  performanceMatrix: {
    includedNotes?: string[];
    posture: {
      score: number;
      note: string;
      talkingPoints: {
        id: string;
        text: string;
        status: "red" | "black" | "green";
      }[];
    };
    pace: {
      score: number;
      note: string;
      talkingPoints: {
        id: string;
        text: string;
        status: "red" | "black" | "green";
      }[];
    };
    path: {
      score: number;
      note: string;
      talkingPoints: {
        id: string;
        text: string;
        status: "red" | "black" | "green";
      }[];
    };
    purpose: {
      score: number;
      note: string;
      talkingPoints: {
        id: string;
        text: string;
        status: "red" | "black" | "green";
      }[];
    };
  };

  // Step 4: The Past (Milestones)
  milestones: {
    originalWhy: string;
    smartGoal: string; // "Skiing trip ready by [Date]"
  };

  // Step 5: The Future
  strategy: {
    primaryPlan: string; // "Routine Mastery"
    focusAreas: string; // "Immediate machine focus..."
  };

  roadmap?: {
    trackType?: "maintenance" | "goals" | "refinement";

    // Maintenance
    selectedHabits?: string[];
    routineChangeRequested?: boolean;
    routineModifications?: string;

    // Goals
    emotionalAnchor?: string;
    smartGoal?: string;
    targetMachineId?: string;
    goalActions?: string[];
    machinePlan?: string;

    // Refinement
    refinementFocusArea?: "Posture" | "Pace" | "Path" | "Purpose" | string;
    routineIntervention?: string;

    // Legacy
    anchorCategory?: "weight_loss" | "eih_management" | "general_conditioning";
    prescriptionType?: "quantitative" | "qualitative";
    inStudioPrescription?: {
      targetMachine: string;
      targetMetric?: string;
      qualitativeFocus?: string;
      timeframe: string;
    };
  };

  trainerNotes?: string;

  createdAt: any;
}

export type FocusCategory = "Posture" | "Pace" | "Path" | "Purpose";

export type FocusStatus = "Active" | "Achieved" | "Deleted";

export interface FocusRecord {
  studioId?: string;
  id: string;
  clientId: string;
  category: FocusCategory;
  dateAssigned: any; // Timestamp or date string
  assignedBy: string; // Trainer initials
  trainerId: string; // Trainer ID
  targetMachineId?: string; // Machine ID
  clinicalNotes: string;
  status: FocusStatus;
  dateUpdated?: any;
}

export interface TrainerFocus {
  studioId?: string;
  id?: string;
  clientId: string;
  trainerId: string;
  trainerName: string;
  category: FocusCategory;
  notes: string;
  updatedAt: any;
}

/**
 * PHYSICAL LOCATION SCHEMA
 * Studios are the primary organizational units where workouts occur.
 */
export interface Studio {
  id?: string;
  name: string;
  ownerId: string;
  headTrainerId?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  timezone: string;
  /** MindBody Site ID for external API synchronization */
  mindbodySiteId?: string;
  /** MindBody Location ID for location-specific filtering when site IDs are shared */
  mindbodyLocationId?: string | number;
  locationType?: "corporate" | "franchise";
  createdAt?: any;
  networkId?: string; // Newly added to associate with a FranchiseNetwork
  machineSettings?: Record<string, Record<string, string>>; // studioStandardSettings per machine
  retentionSettings?: {
    atRiskThresholdDays: number;
    miaThresholdDays: number;
    autoExcludeAfterDays: number;
    sleepPoorCountThreshold?: number;
    poorMachineLogsThreshold?: number;
    stressLowCountThreshold?: number;
    stressLowValueThreshold?: number;
    noStrengthGainsDays?: number;
  };
  notificationSettings?: {
    bookingRemindersEnabled?: boolean;
    dailySummaryEnabled?: boolean;
  };
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
  brandColor?: string;
}

export interface HubAnnouncement {
  id?: string;
  title: string;
  shortContent: string;
  longContent: string;
  authorId: string;
  authorName: string;
  studioId: string | "all"; // Legacy scope field
  targetScope?: "universal" | "network" | "studio";
  targetId?: string; // Network ID or Studio ID
  type?: "shout-out" | "tip" | "news" | "event" | "holiday";
  referenceTarget?: {
    type: "trainer" | "client" | "studio";
    id: string;
  };
  expiresAt?: any; // Timestamp for auto-expiration
  createdAt: any;
  isActive: boolean;
  priority: "low" | "medium" | "high"; // Treated as urgency
  readBy?: string[];
}

export interface LeaderboardRank {
  clientId: string;
  clientName: string;
  weight: number;
  rank: number;
  percentile: number;
  reps?: number;
  gap?: number;
  strengthGainPercent?: number;
  maxWeight?: number;
}

export interface LeaderboardMachineData {
  topPerformers: LeaderboardRank[];
  stats: {
    count: number;
    avg: number;
    max: number;
    min: number;
    buckets: { min: number; max: number; count: number }[];
  };
  percentileThresholds: {
    p90: number;
    p75: number;
    p50: number;
    p25: number;
    p10: number;
  };
  clientPlacements: Record<
    string,
    { weight: number; rank: number; percentile: number }
  >; // clientId -> placement details
}

export interface LeaderboardDocument {
  id?: string;
  lastUpdated: any;
  scope: "global" | string; // 'global' or studioId
  machineData: Record<string, LeaderboardMachineData>;
}

export type View =
  | "trainers"
  | "clients"
  | "machines"
  | "workouts"
  | "history"
  | "calendar"
  | "trainer-hub"
  | "dashboard"
  | "profile"
  | "chart"
  | "progress-report"
  | "clinical-review"
  | "trainer-profile"
  | "progress-report"
  | "consultation-wizard"
  | "machine-knowledge"
  | "machine-anatomy"
  | "client-directory"
  | "chart-importer"
  | "leaderboard"
  | "admin-dashboard"
  | "franchise-dashboard"
  | "retention"
  | "mindbody"
  | "purchases";

export interface AuditLogEntry {
  id?: string;
  action: string;
  collection: string;
  documentId: string;
  userId: string;
  studioId?: string;
  details?: Record<string, any>;
  timestamp: any;
}
