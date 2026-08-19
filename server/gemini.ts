import { GoogleGenAI, Type } from "@google/genai";
import { parseSessionDate } from "../src/lib/utils";

const OCR_MODEL = "gemini-3-flash-preview";

export interface ValidationLog {
  id: string;
  name: string;
  rawName?: string;
  settings?: string;
  weight: number;
  reps: any;
  isStaticHold: boolean;
  timeUnderLoad?: number | null;
  machineId?: string;
  isAnomalous?: boolean;
  anomalyReason?: string;
}

export interface ValidationSession {
  id: string;
  sessionNumber: number;
  date: string;
  trainer: string;
  trainerId?: string;
  machines: ValidationLog[];
  isInferredDate?: boolean;
  hasConflict?: boolean;
}

export function sanitizeImportedSessions(
  sessions: ValidationSession[],
): ValidationSession[] {
  // Sort by sessionNumber chronologically initially
  const sorted = [...sessions].sort(
    (a, b) => a.sessionNumber - b.sessionNumber,
  );

  let lastValidDateTS = new Date().getTime();

  for (let i = 0; i < sorted.length; i++) {
    const sess = sorted[i];

    // Check if missing or invalid date for Rule 2 / 3
    let isInvalidDate =
      !sess.date ||
      sess.date.toLowerCase() === "confirm" ||
      sess.date === "0" ||
      sess.isInferredDate;

    let currentTS = 0;
    if (!isInvalidDate) {
      currentTS = parseSessionDate(sess.date);
      if (currentTS <= 0) {
        isInvalidDate = true;
      }
    }

    if (isInvalidDate) {
      // Rule 2: Dynamic Rest Imputation (+4 days)
      if (i > 0) {
        lastValidDateTS += 4 * 24 * 60 * 60 * 1000;
        sess.isInferredDate = true;
      } else {
        // First session and mostly blank
        sess.isInferredDate = true;
      }

      const d = new Date(lastValidDateTS);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      sess.date = `${yyyy}-${mm}-${dd}`;
    } else {
      // Rule 3: Trust the OCR
      lastValidDateTS = currentTS;
      sess.isInferredDate = false;
      const d = new Date(lastValidDateTS);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      sess.date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // 2. Rule 1: One Session Per Day Constraint
  const mergedSessions: ValidationSession[] = [];
  const dateMap: Record<string, ValidationSession> = {};

  for (const sess of sorted) {
    if (dateMap[sess.date]) {
      const existing = dateMap[sess.date];
      let conflict = false;

      sess.machines.forEach((incomingMachine) => {
        const existingMachine = existing.machines.find(
          (m) => m.machineId === incomingMachine.machineId,
        );
        if (existingMachine) {
          if (
            existingMachine.weight !== incomingMachine.weight ||
            existingMachine.reps !== incomingMachine.reps
          ) {
            conflict = true;
          }
        } else {
          existing.machines.push(incomingMachine);
        }
      });

      if (conflict) {
        existing.hasConflict = true;
      }
    } else {
      dateMap[sess.date] = sess;
      mergedSessions.push(sess);
    }
  }

  // Re-number sessions after merge
  mergedSessions.sort(
    (a, b) => parseSessionDate(a.date) - parseSessionDate(b.date),
  );
  mergedSessions.forEach((sess, idx) => {
    sess.sessionNumber = idx + 1;
  });

  return mergedSessions;
}

export const AI_SETUP_PROMPT = `You are an elite MaxStrength Fitness (MSF) clinical high-intensity strength coach. Your role is to guide floor trainers step-by-step through setting up clients safely and effectively on specific exercise machines.

You must cross-reference the client's specific ailments with this machine's mechanics. If the client has a condition that conflicts with this machine (e.g., Lumbar issues on a Leg Press), your FIRST priority is to generate strict safety modifications, padding setups, or suggest skipping the machine entirely. Be concise, clinical, and biomechanically precise.

CORE PHILOSOPHY:
- Emphasize practical alignment (joint stacking, continuous tension) over theoretical alignment.
- Emphasize safety, especially during entry/exit (e.g., "Watch your head").
- MSF uses Continuous Tension (slow cadences, no pausing at turnarounds unless specified). Do not use traditional bodybuilding terms like "3 sets of 10".

STRICT RULES:
1. NO HALLUCINATIONS: You must base your setup steps ONLY on the provided "Reference Text". Do not invent seat settings, pad gaps, or safety rules that are not in the text.
2. ADAPT TO CONSTRAINTS: If "Client Details" are provided (e.g., "short arms", "knee pain"), you must scan the Reference Text for modifications and apply them to the setup steps.
3. OUTPUT FORMAT: You must output ONLY a valid JSON object matching the exact schema requested. Do not include markdown code blocks (\`\`\`json) or conversational text outside the JSON.`;

export const AI_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    targetMuscles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of primary muscles targeted.",
    },
    initialAdjustments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Steps to take BEFORE the client enters (e.g., clear weight stack, set standard gap).",
    },
    entryAndSafety: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Step-by-step instructions for safely loading the client into the machine.",
    },
    alignmentAndPosture: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Instructions for seat height, joint stacking, and posture (e.g., 'chest up').",
    },
    clientModifications: {
      type: Type.STRING,
      description:
        "Specific adjustments made based on the provided Client Details. If none, output 'Standard MSF setup applies.'",
    },
  },
  required: [
    "targetMuscles",
    "initialAdjustments",
    "entryAndSafety",
    "alignmentAndPosture",
    "clientModifications",
  ],
};

let genaiClient: GoogleGenAI | null = null;

const withRetry = async <T>(
  operationName: string,
  fn: () => Promise<T>,
  retries = 3,
  initialDelay = 1000,
): Promise<T> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      const msg = e.message || String(e);
      const isRetryable =
        e.status === 503 ||
        e.status === 429 ||
        msg.includes("503") ||
        msg.includes("429");
      if (attempt >= retries || !isRetryable) {
        throw new Error(`Gemini API Error during ${operationName}: ${msg}`);
      }
      console.log(
        `[Gemini API] Retry ${attempt}/${retries} for ${operationName} after ${initialDelay * attempt}ms due to: ${msg}`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelay * attempt),
      );
    }
  }
  throw new Error("unreachable");
};

export const AI_EXECUTION_PROMPT = `You are an elite MaxStrength Fitness (MSF) Master Trainer. Your role is to provide floor trainers with the exact execution rules and vocal cues needed to coach a client through a set on a specific exercise machine.

CORE PHILOSOPHY (PACE & PURPOSE):
- Pace: Continuous tension. A slow, controlled cadence (typically 6 seconds positive, 6 seconds negative) with no pausing at turnarounds unless explicitly stated in the reference text.
- Purpose: Achieving deep momentary muscular failure. 
- Turnarounds: Emphasize smooth changes of direction (e.g., "drag out the turn", "touch and go").
- Communication: Instructors use calm, authoritative, and specific cues. No traditional gym jargon (e.g., do not say "pump out 10 reps").

STRICT RULES:
1. NO HALLUCINATIONS: Base your execution steps, turnaround rules, and specific vocal quotes ONLY on the provided "Reference Text". 
2. EXTRACT QUOTES: If the text provides exact phrases to say (e.g., "chest up, drive through the elbows"), extract them precisely for the trainer to use.
3. OUTPUT FORMAT: You must output ONLY a valid JSON object matching the requested schema. Do not include markdown formatting like \`\`\`json or any conversational text.`;

export const AI_EXECUTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gradualLoadUp: {
      type: Type.STRING,
      description:
        "Instructions for how the client should initiate the first rep (e.g., 'apply 101 lbs of pressure to a 100 lb stack').",
    },
    turnaroundRules: {
      type: Type.OBJECT,
      properties: {
        lowerTurn: {
          type: Type.STRING,
          description:
            "Specific rules for the lower turnaround (e.g., 'touch and go smoothly', 'no pausing').",
        },
        upperTurn: {
          type: Type.STRING,
          description:
            "Specific rules for the upper turnaround (e.g., 'pause for 1-2 seconds', 'squeeze for 2-3 seconds').",
        },
      },
      required: ["lowerTurn", "upperTurn"],
    },
    activeSetCues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "A list of 3 to 5 specific vocal cues or instructions the trainer should say during the set, extracted directly from the text.",
    },
    failureAndExit: {
      type: Type.STRING,
      description:
        "Instructions on how to handle the end of the set, achieving failure, and safely unloading the client.",
    },
  },
  required: [
    "gradualLoadUp",
    "turnaroundRules",
    "activeSetCues",
    "failureAndExit",
  ],
};

export const AI_CLINICAL_PROMPT = `You are an elite MaxStrength Fitness (MSF) Master Trainer and Clinical Strategist. Your role is to advise floor trainers on how to handle client limitations, injuries, special populations, and programming progressions for specific exercises.

CORE PHILOSOPHY (SAFETY & PROGRESSION):
- Safety overrides intensity. If dynamic movement is contraindicated (e.g., Torso Rotation with osteoporosis), you must recommend a conservative alternative like a Static Hold (SH) or Timed Static Contraction (TSC).
- TSC Protocol: Typically involves pinning the weight stack so the movement arm cannot move, placing the client near mid-range, and cueing progressive effort (e.g., 30 sec @ 50%, 30 sec @ 75%, 30 sec @ 100%).
- Progression: Form and control must be perfected before load is increased. Standard failure is targeted in 10 reps or fewer. 

STRICT RULES:
1. NO HALLUCINATIONS: Base all modifications, static protocols, and exercise substitutions strictly on the provided "Reference Text".
2. ADAPT TO CONSTRAINTS: Directly address the user's "Client Details" (e.g., "knee valgus", "shoulder pain"). If the reference text suggests an alternative exercise or a shortened ROM for that issue, state it clearly.
3. OUTPUT FORMAT: You must output ONLY a valid JSON object matching the requested schema. Do not include markdown formatting like \`\`\`json or any conversational text.`;

export const AI_CLINICAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contraindications: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Specific conditions or injuries where this exercise should be avoided or severely limited (e.g., 'Osteoporosis on Torso Rotation').",
    },
    dynamicModifications: {
      type: Type.STRING,
      description:
        "Adjustments to the standard dynamic movement for specific limitations (e.g., 'Shorten ROM by pinning the weight stack', 'Use Torso Arm setup instead of Pulldown').",
    },
    staticAlternativeProtocol: {
      type: Type.OBJECT,
      properties: {
        isRecommended: { type: Type.BOOLEAN },
        setupAndExecution: {
          type: Type.STRING,
          description:
            "Step-by-step on how to set up the TSC or Static Hold (SH), including pin placement and time/effort protocol (e.g., 30/30/30 sec).",
        },
      },
      required: ["isRecommended", "setupAndExecution"],
    },
    approvedSubstitutions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Alternative exercises to perform if this machine cannot be used, based strictly on the reference text.",
    },
    progressionAdvice: {
      type: Type.STRING,
      description:
        "Specific rules for progressing this client on this machine (e.g., 'Do not progress load until 6-sec/6-sec cadence is mastered').",
    },
  },
  required: [
    "contraindications",
    "dynamicModifications",
    "staticAlternativeProtocol",
    "approvedSubstitutions",
    "progressionAdvice",
  ],
};

function getGenaiClient(): GoogleGenAI {
  if (!genaiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    genaiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genaiClient;
}

export interface SetupWizardResult {
  targetMuscles: string[];
  initialAdjustments: string[];
  entryAndSafety: string[];
  alignmentAndPosture: string[];
  clientModifications: string;
}

export async function generateMachineSetupGuide(
  machineName: string,
  clientDetails: string,
  referenceText: string,
  clientAilments: string = "",
  machineContraindications: string = "",
): Promise<SetupWizardResult> {
  const ai = getGenaiClient();
  const prompt = `TARGET MACHINE: ${machineName}
CLIENT DETAILS/CONSTRAINTS: ${clientDetails}
CLIENT CLINICAL PROFILE (AILMENTS): ${clientAilments}
MACHINE KNOWN CONTRAINDICATIONS: ${machineContraindications}

MSF REFERENCE TEXT:
"""
${referenceText}
"""

TASK:
Analyze the MSF Reference Text. Generate a step-by-step setup guide for the trainer to get the client safely into the ${machineName}. Ensure any specific limitations mentioned in the Client Details and Clinical Profile are addressed using rules found in the Reference Text. Specifically check against the Machine Known Contraindications. Return ONLY the requested JSON object.`;

  const response = await withRetry("generateMachineSetupGuide", () =>
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: AI_SETUP_PROMPT,
        responseMimeType: "application/json",
        responseSchema: AI_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No text returned from Gemini");
  }

  try {
    return JSON.parse(response.text) as SetupWizardResult;
  } catch (e) {
    console.error("Gemini returned invalid JSON", response.text);
    throw new Error("Failed to parse Gemini output");
  }
}

export interface ExecutionGuideResult {
  gradualLoadUp: string;
  turnaroundRules: {
    lowerTurn: string;
    upperTurn: string;
  };
  activeSetCues: string[];
  failureAndExit: string;
}

export async function generateExecutionGuide(
  machineName: string,
  referenceText: string,
): Promise<ExecutionGuideResult> {
  const ai = getGenaiClient();
  const prompt = `TARGET MACHINE: ${machineName}

MSF REFERENCE TEXT:
"""
${referenceText}
"""

TASK:
Analyze the provided MSF Reference Text for the ${machineName}. Generate a structured coaching guide that a trainer can read while the client is actively performing the exercise. Focus strictly on the execution of the movement, the pacing, turnaround rules, and specific verbal cues. Return ONLY the requested JSON object.`;

  const response = await withRetry("generateExecutionGuide", () =>
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: AI_EXECUTION_PROMPT,
        responseMimeType: "application/json",
        responseSchema: AI_EXECUTION_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No text returned from Gemini");
  }

  try {
    return JSON.parse(response.text) as ExecutionGuideResult;
  } catch (e) {
    console.error("Gemini returned invalid JSON", response.text);
    throw new Error("Failed to parse Gemini output");
  }
}

export interface ClinicalStrategyResult {
  contraindications: string[];
  dynamicModifications: string;
  staticAlternativeProtocol: {
    isRecommended: boolean;
    setupAndExecution: string;
  };
  approvedSubstitutions: string[];
  progressionAdvice: string;
}

export async function generateClinicalStrategy(
  machineName: string,
  clientDetails: string,
  referenceText: string,
  clientAilments: string = "",
  machineContraindications: string = "",
): Promise<ClinicalStrategyResult> {
  const ai = getGenaiClient();
  const prompt = `TARGET MACHINE: ${machineName}
CLIENT DETAILS/INJURIES: ${clientDetails}
CLIENT CLINICAL PROFILE (AILMENTS): ${clientAilments}
MACHINE KNOWN CONTRAINDICATIONS: ${machineContraindications}

MSF REFERENCE TEXT (Including Quick Reference & Substitutions):
"""
${referenceText}
"""

TASK:
Analyze the MSF Reference Text, the specific Client Details, and explicitly cross-reference the Client Clinical Profile against the Machine Known Contraindications. Generate a clinical strategy and progression guide for the trainer. If the client's condition requires a Static Hold (SH) or Timed Static Contraction (TSC), detail the exact setup. If the exercise is completely contraindicated, provide the approved substitutions. Return ONLY the requested JSON object.`;

  const response = await withRetry("generateClinicalStrategy", () =>
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: AI_CLINICAL_PROMPT,
        responseMimeType: "application/json",
        responseSchema: AI_CLINICAL_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No text returned from Gemini");
  }

  try {
    return JSON.parse(response.text) as ClinicalStrategyResult;
  } catch (e) {
    console.error("Gemini returned invalid JSON", response.text);
    throw new Error("Failed to parse Gemini output");
  }
}

export interface ExtractedSessionHeader {
  sessionNumber: number;
  date: string;
  trainer: string;
}

export interface ExtractedPerformance {
  sessionNumber: number;
  machineName: string;
  settings: string;
  weight: number;
  reps: string | number;
  isStaticHold?: boolean;
}

export interface OCRMachineSetting {
  machineId: string;
  seat?: string;
  gap?: string;
  backPad?: string;
  handles?: string;
  armPad?: string;
  rawSettings?: Record<string, string>;
}

export interface OCRResult {
  sessionHeaders: ExtractedSessionHeader[];
  performances: ExtractedPerformance[];
}

export const MACHINE_SETTINGS_OCR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    settings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          machineId: {
            type: Type.STRING,
            description:
              "The official machine ID from the provided dictionary.",
          },
          seat: { type: Type.STRING },
          gap: { type: Type.STRING },
          backPad: { type: Type.STRING },
          handles: { type: Type.STRING },
          armPad: { type: Type.STRING },
          rawSettings: {
            type: Type.OBJECT,
            description: "Any other key-value settings found.",
          },
        },
        required: ["machineId"],
      },
    },
  },
  required: ["settings"],
};

export const CHART_OCR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sessionHeaders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sessionNumber: { type: Type.NUMBER },
          date: { type: Type.STRING },
          trainer: { type: Type.STRING },
        },
        required: ["sessionNumber", "date", "trainer"],
      },
    },
    performances: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sessionNumber: { type: Type.NUMBER },
          machineName: { type: Type.STRING },
          settings: { type: Type.STRING },
          weight: { type: Type.NUMBER },
          reps: { type: Type.STRING },
          isStaticHold: { type: Type.BOOLEAN },
        },
        required: [
          "sessionNumber",
          "machineName",
          "settings",
          "weight",
          "reps",
        ],
      },
    },
  },
  required: ["sessionHeaders", "performances"],
};

export async function extractMachineSettingsFromImage(
  images: { base64: string; mimeType: string }[],
): Promise<OCRMachineSetting[]> {
  const ai = getGenaiClient();

  const machineDictionary = {
    LP: "m-leg-press",
    LE: "m-ext",
    LC: "m-leg-curl",
    ABD: "m-hip-abd",
    ADD: "m-hip-add",
    CP: "m-chest-press",
    OP: "m-overhead-press",
    SD: "m-dip",
    CF: "m-chest-fly",
    TE: "m-tricep-ext",
    LR: "m-lateral-raise",
    CR: "m-compound-row",
    PD: "m-pulldown",
    PO: "m-pullover",
    SR: "m-simple-row",
    BC: "m-bicep",
    "LE/L": "m-lumbar",
    AB: "m-abs",
    TR: "m-torso-rotation",
    CE: "m-neck",
  };

  const systemInstruction = `You are an expert at decoding messy, handwritten clinical workout charts. Your specific task is to extract historical MACHINE SETTINGS from Column 2 of the provided chart.

**CONTEXT & VISUAL LAYOUT:**
1. **Column 1 (Far Left):** Contains the Machine Name or Abbreviation (e.g., "LP", "Chest Press").
2. **Column 2 (Immediately Right):** Contains the "Settings" box. This is a messy string of symbols, letters, and numbers (e.g., "S4 G2", "S-4, B-P2", "W, S5", "H: M").

**MACHINE ID DICTIONARY:**
Map abbreviations to these official IDs:
${JSON.stringify(machineDictionary, null, 2)}

**EXTRACTION HEURISTICS (The Decoder):**
- **Seat Height:** Look for "S", "St", or "Seat" followed by a number (e.g., "S4" -> seat: "4").
- **Gap:** Look for "G", "Gp", or "Gap" followed by a number (e.g., "G2" -> gap: "2").
- **Back Pad:** Look for "B", "Bk", "Back", or protocol positions like "P2", "P3" (e.g., "B: P2" -> backPad: "P2").
- **Handles/Arm Pads (Width):** Look for "H", "W", "M", "N" indicating Wide, Middle, or Narrow setups (e.g., "H: M" -> handles: "M").

**STRICT RULES:**
- Setting values MUST be numeric (e.g. "4", "2.5", "12"), pin/protocol codes (e.g. "P2", "P3"), or width codes (e.g. "W", "M", "N", "Wide", "Narrow").
- NEVER return English words like "project", "client", "exercise", "routine", "general", or notes as machine settings.
- Ignore weight and rep data. ONLY focus on the static machine settings.
- If a machine is listed multiple times, return it only once with its most recent/complete settings.
- If a field is not found or is ambiguous/illegible, omit it from the object.
- CRITICAL: Process EVERY image in the array. Each image may have different settings.
- Return ONLY valid JSON matching the requested schema.`;

  const imageParts = images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));

  const response = await withRetry("extractMachineSettingsFromImage", () =>
    ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          parts: [
            ...imageParts,
            {
              text: `Analyze the charts and extract all machine settings found in the second column across all ${images.length} images.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: MACHINE_SETTINGS_OCR_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No data returned from settings extraction.");
  }

  try {
    const parsed = JSON.parse(response.text);
    return parsed.settings as OCRMachineSetting[];
  } catch (e) {
    console.error("Settings Parse Error:", response.text);
    throw new Error("Failed to parse extracted settings.");
  }
}

export async function processLegacyChart(
  images: { base64: string; mimeType: string }[],
  expectedSessions: number,
  pageIndex?: number,
  totalPages?: number,
): Promise<OCRResult> {
  const ai = getGenaiClient();

  const systemInstruction = `You are a high-precision clinical data extraction AI. You are extracting data from Page ${pageIndex !== undefined ? pageIndex + 1 : "N"} of ${totalPages ? totalPages : images.length} training chart images.

**CRITICAL: FULL HORIZONTAL SCAN (12 COLUMNS)**
- Every MSF Legacy Chart page contains a grid with exactly 12 vertical columns for sessions.
- You MUST scan across all 12 columns for EVERY machine row.
- Even if a column looks faint or has minimal data, attempt to extract the session number, date, weight, and reps.
- DO NOT skip any data points. If a value is present, it is critical medical/fitness history.

**PASS 1: THE CHRONOLOGICAL TIMELINE (HEADERS)**
- There is a blue header row.
- Row 1: Session Number (1, 2, 3... up to 12 per page).
- Row 2: Date (e.g., "5/21").
- Row 3: Trainer Initials (e.g., "AJ").
- Extract all 12 headers into the sessionHeaders array.

**PASS 2: THE PERFORMANCE GRID**
- Column 1: Machine Name (e.g., "Leg Press", "LP").
- Column 2: Machine Settings (e.g., "S4", "G2").
- Columns 3-14: Performance Data.
- Top number in a box = Weight.
- Bottom number in a box = Reps.
- If bottom text includes "SH" or "sec" or is > 20, set isStaticHold to true.

**DATA INTEGRITY:**
- If data is illegible, use "0" for numbers and "CONFIRM" for text. Do not hallucinate.
- Ensure the sessionNumber in 'performances' matches the sessionNumber extracted in 'sessionHeaders'.

Expected total columns in this segment: 12.
Return ONLY valid JSON matching the requested schema.`;

  const imageParts = images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));

  const response = await withRetry("processLegacyChart", () =>
    ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          parts: [
            ...imageParts,
            {
              text: `Analyze all ${images.length} training chart images and extract data session-by-session into a consolidated structure. Total expected columns to find: up to 12 per page.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: CHART_OCR_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No data returned from OCR engine.");
  }

  try {
    return JSON.parse(response.text) as OCRResult;
  } catch (e) {
    console.error("OCR Parse Error:", response.text);
    throw new Error("Failed to parse clinical chart data.");
  }
}
