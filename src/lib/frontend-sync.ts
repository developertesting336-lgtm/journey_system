import { collection, getDocs, writeBatch, doc, Timestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Trainer, Client, Studio } from '../types';
import { normalizeName, cleanAlphanumeric, findMatchingTrainer } from './sync-utils';

const extractClientName = (summary: string, description: string) => {
  const patterns = [
    /Client:\s*([^(\r\n]+)/i,
    /\(([^)]+)\)/,
    /^([^(:||\n]+)[:|\\-]/,
    /for\s+([^(\r\n]+)/i,
  ];
  const fullText = `${summary}\n${description}`;
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && !name.toLowerCase().includes('training') && !name.toLowerCase().includes('workout')) {
        return name;
      }
    }
  }
  return summary.replace(/Personal Training|Workout|Session/gi, '').trim();
};

export async function executeFrontendMasterSync(
  targetTrainerId: string | null,
  hardReset: boolean,
  trainers: Trainer[],
  clientsData: Client[],
  studiosWithNames: Studio[]
) {
  const syncId = Math.random().toString(36).substring(7);
  console.log(`[FrontendSync-${syncId}] Starting Master Schedule Sync...`);

  try {
    let targetTrainers = trainers.filter(t => t.mindbody_ical_url);
    if (targetTrainerId) {
      targetTrainers = targetTrainers.filter(t => t.id === targetTrainerId);
    }

    if (targetTrainers.length === 0) {
      console.log(`[FrontendSync-${syncId}] No trainers found with iCal URLs.`);
      return;
    }

    console.log(`[FrontendSync-${syncId}] Found ${targetTrainers.length} trainers with feeds.`);

    // If hardReset, we just delete all Scheduled entries the frontend user has access to read/write.
    // However, it's safer to avoid doing a blind query of 'status == Scheduled' because a regular trainer could only delete stuff from their studio, which is fine!
    if (hardReset) {
      console.log(`[FrontendSync-${syncId}] Performing hard reset for targets...`);
      for (const trainer of targetTrainers) {
         const allScheduled = await getDocs(query(collection(db, 'schedules'), where('status', '==', 'Scheduled'), where('trainerId', '==', trainer.id)));
         let batch = writeBatch(db);
         let batchCount = 0;
         for (const d of allScheduled.docs) {
           batch.delete(d.ref);
           batchCount++;
           if (batchCount >= 400) {
             await batch.commit();
             batch = writeBatch(db);
             batchCount = 0;
           }
         }
         if (batchCount > 0) {
           await batch.commit();
         }
      }
    }

    const findClientForTrainerSync = (clientName: string, trainerHomeStudioId?: string): string | null => {
      if (!clientName) return null;
      const normalizedSName = normalizeName(clientName);
      const cleanSName = cleanAlphanumeric(clientName);

      const isFuzzyMatch = (sName: string, first: string, last: string, mbName?: string): boolean => {
        const sNameClean = sName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const cFirstClean = (first || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const cLastClean = (last || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const cFullClean = `${cFirstClean} ${cLastClean}`.trim();
        
        if (mbName) {
          const mbClean = mbName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
          if (sNameClean === mbClean) return true;
        }

        if (sNameClean === cFullClean) return true;

        const sWords = sNameClean.split(/\s+/).filter(Boolean);
        const cWords = [cFirstClean, cLastClean].filter(Boolean);

        if (sWords.length === 0 || cWords.length === 0) return false;
        if (sWords[0] !== cWords[0]) return false;

        if (sWords.length === 1 && cWords.length > 1) return true;
        if (sWords.length > 1 && cWords.length === 1) return true;

        if (sWords.length >= 2 && cWords.length >= 2) {
          const sLast = sWords.slice(1).join(' ');
          const cLast = cWords.slice(1).join(' ');
          
          if (sLast === cLast) return true;
          if (sLast.length === 1 && cLast.startsWith(sLast)) return true;
          if (cLast.length === 1 && sLast.startsWith(cLast)) return true;
        }

        return false;
      };

      if (trainerHomeStudioId) {
        const match = clientsData.find(c => {
          if (c.homeStudioId !== trainerHomeStudioId) return false;
          const first = c.firstName || '';
          const last = c.lastName || '';
          const fullName = normalizeName(`${first} ${last}`);
          if (fullName === normalizedSName || cleanAlphanumeric(fullName) === cleanSName) return true;
          if (c.mindbody_name && (normalizeName(c.mindbody_name) === normalizedSName || cleanAlphanumeric(c.mindbody_name) === cleanSName)) return true;
          
          return isFuzzyMatch(clientName, first, last, c.mindbody_name);
        });
        if (match) return match.id || null;
      }

      const matchGlobal = clientsData.find(c => {
        const first = c.firstName || '';
        const last = c.lastName || '';
        const fullName = normalizeName(`${first} ${last}`);
        if (fullName === normalizedSName || cleanAlphanumeric(fullName) === cleanSName) return true;
        if (c.mindbody_name && (normalizeName(c.mindbody_name) === normalizedSName || cleanAlphanumeric(c.mindbody_name) === cleanSName)) return true;
        
        return isFuzzyMatch(clientName, first, last, c.mindbody_name);
      });
      return matchGlobal ? matchGlobal.id || null : null;
    };

    const resolveStudioId = (mbLocationStr?: string | number): string | null => {
      if (!mbLocationStr) return null;
      const t = String(mbLocationStr).toLowerCase();
      for (const s of studiosWithNames) {
        if (s.name && t.includes(s.name.toLowerCase())) {
          return s.id || null;
        }
        if (s.mindbodySiteId && t.includes(String(s.mindbodySiteId).toLowerCase())) {
          return s.id || null;
        }
      }
      return null;
    };

    const now = new Date();
    const thirtyDaysAgoTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAheadTime = now.getTime() + 30 * 24 * 60 * 60 * 1000;

    for (const trainer of targetTrainers) {
      console.log(`[FrontendSync-${syncId}] Syncing trainer: ${trainer.fullName}`);
      try {
        const response = await fetch('/api/parse-ical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trainer.mindbody_ical_url })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to parse iCal');
        const vevents = data.events;
        
        const sessionUidsInFetch = new Set<string>();

        // Fetch existing schedules for this trainer
        const windowSnap = await getDocs(query(collection(db, 'schedules'), where('trainerId', '==', trainer.id)));
        
        const existingSchedulesMap: Record<string, { id: string, data: any }> = {};
        windowSnap.forEach(d => {
          const docData = d.data();
          if (docData.startTime) {
            const time = docData.startTime.toDate ? docData.startTime.toDate().getTime() : docData.startTime;
            if (time >= thirtyDaysAgoTime && time <= thirtyDaysAheadTime) {
              if (docData.ical_uid) {
                existingSchedulesMap[docData.ical_uid] = { id: d.id, data: docData };
              }
            }
          }
        });

        let batch = writeBatch(db);
        let batchCount = 0;

        for (const ev of vevents as any[]) {
          const uid = ev.uid;
          if (!uid || !ev.start || !ev.end) continue;
          sessionUidsInFetch.add(uid);

          const summary = typeof ev.summary === 'object' ? (ev.summary as any).val : (ev.summary || '');
          const description = typeof ev.description === 'object' ? (ev.description as any).val : (ev.description || '');
          const clientName = extractClientName(summary, description);
          const clientId = findClientForTrainerSync(clientName, trainer.primaryHomeStudioId);
          
          // If we matched a client but their profile doesn't have the mindbodyClientId yet
          // Note: In iCal subscription sync, we do not have a separate numerical mbClientId.
          // However, we can use the clientName from the event to help with mapping if needed,
          // or if they have an iCal association, we can set mindbody_name.
          if (clientId) {
            const matchedClient = clientsData.find(c => c.id === clientId);
            if (matchedClient && !matchedClient.mindbody_name) {
              batch.update(doc(db, 'clients', clientId), {
                mindbody_name: clientName
              });
              matchedClient.mindbody_name = clientName;
              batchCount++;
            }
          }

          const isCancelled = 
            (ev.status && typeof ev.status === 'string' && ev.status.toUpperCase() === 'CANCELLED') ||
            summary.toLowerCase().includes('cancel') ||
            summary.toLowerCase().includes('cancelled') ||
            description.toLowerCase().includes('cancel');

          const startTime = Timestamp.fromDate(new Date(ev.start));
          const endTime = Timestamp.fromDate(new Date(ev.end));
          const serviceName = summary.includes('(') ? summary.split('(')[0].trim() : (summary || 'Training Session');

          const payload = {
            ical_uid: uid,
            clientName,
            clientId,
            trainerId: trainer.id,
            trainerName: trainer.fullName,
            startTime,
            endTime,
            studioId: resolveStudioId(ev.location) || trainer.primaryHomeStudioId || null,
            serviceName,
            status: isCancelled ? 'Cancelled' : 'Scheduled',
            source: 'Subscription',
            lastSyncAt: Timestamp.now()
          };

          const existing = existingSchedulesMap[uid];
          
          if (!existing) {
            const newRef = doc(collection(db, 'schedules'));
            batch.set(newRef, {
              ...payload,
              createdAt: Timestamp.now()
            });
            batchCount++;
          } else {
            const current = existing.data;
            const currentStartTime = current.startTime?.toDate ? current.startTime.toDate().getTime() : current.startTime;
            const currentEndTime = current.endTime?.toDate ? current.endTime.toDate().getTime() : current.endTime;
            const hasChanged = 
              current.status !== payload.status ||
              current.clientName !== payload.clientName ||
              current.clientId !== payload.clientId ||
              current.serviceName !== payload.serviceName ||
              current.studioId !== payload.studioId ||
              currentStartTime !== startTime.toDate().getTime() ||
              currentEndTime !== endTime.toDate().getTime();

            if (hasChanged) {
               batch.update(doc(db, 'schedules', existing.id), payload);
               batchCount++;
            }
          }

          if (batchCount >= 400) {
            try {
              await batch.commit();
            } catch (error: any) {
              throw new Error(`Batch commit failed at count ${batchCount} during chunk processing: ${error.message}`);
            }
            batch = writeBatch(db);
            batchCount = 0;
          }
        }

        for (const uid in existingSchedulesMap) {
          if (!sessionUidsInFetch.has(uid) && existingSchedulesMap[uid].data.status === 'Scheduled') {
            const staleId = existingSchedulesMap[uid].id;
            batch.update(doc(db, 'schedules', staleId), {
              status: 'Cancelled',
              cancellationReason: 'Session removed from MindBody feed',
              updatedAt: Timestamp.now()
            });
            batchCount++;
          }
          if (batchCount >= 400) {
             try {
               await batch.commit();
             } catch (error: any) {
               throw new Error(`Batch commit failed during stale schedules processing: ${error.message}`);
             }
             batch = writeBatch(db);
             batchCount = 0;
          }
        }

        if (batchCount > 0) {
          try {
            await batch.commit();
          } catch (error: any) {
            throw new Error(`Final batch commit failed: ${error.message}`);
          }
        }

      } catch (err: any) {
        console.error(`[FrontendSync-${syncId}] Error syncing trainer ${trainer.fullName}:`, err.message);
      }
    }

    console.log(`[FrontendSync-${syncId}] Master Sync Completed.`);
  } catch (error: any) {
    console.error(`[FrontendSync-${syncId}] Sync operation FAILED:`, error.message);
    throw error;
  }
}
