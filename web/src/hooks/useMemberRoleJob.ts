import { useEffect, useRef, useState } from "react";
import type { MemberRoleJobStatus, UpdateMemberRolesRequest } from "../models/types";
import { fetchMemberRoleStatus, requestMemberRoleUpdate } from "../services/roles/updateMemberRoles";

export const useMemberRoleJob = () => {
  const [job, setJob] = useState<MemberRoleJobStatus | null>(null);
  const jobRef = useRef<MemberRoleJobStatus | null>(null);
  const [recovered, setRecovered] = useState(true);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pollKey, setPollKey] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const updateJob = (next: MemberRoleJobStatus | null) => { jobRef.current = next; setJob(next); };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      let again = false;
      try {
        const { job: next } = await fetchMemberRoleStatus();
        if (cancelled || version !== generation.current) return;
        setMonitorError(null);
        setLastCheckedAt(Date.now());
        if (jobRef.current?.inProgress && !next) {
          updateJob({ ...jobRef.current, inProgress: false, phase: "failed", errorMessage: "The server no longer has this job. It may have restarted; completion is unknown. Check member roles before starting another update." });
        } else {
          if (next && jobRef.current && next.id !== jobRef.current.id) setRecovered(true);
          updateJob(next);
        }
        again = !!next?.inProgress;
      } catch {
        if (!cancelled && version === generation.current) {
          setMonitorError("Progress connection lost. Retrying automatically; the server may still be working. Do not start another update.");
          again = true;
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
          // Schedule after completion to avoid overlapping requests on slow connections.
          if (again) timer = setTimeout(() => void poll(), 1500);
        }
      }
    };
    if (pollKey === 0) void poll();
    else timer = setTimeout(() => void poll(), 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pollKey]);

  useEffect(() => {
    if (!job?.inProgress && !starting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job?.inProgress, starting]);

  const start = async (request: UpdateMemberRolesRequest) => {
    if (starting || checking || jobRef.current?.inProgress || monitorError) return;
    generation.current++;
    setStarting(true);
    setRecovered(false);
    setStartError(null);
    updateJob(null);
    try {
      const { job: next } = await requestMemberRoleUpdate(request);
      if (mounted.current) {
        updateJob(next);
        setNow(Date.now());
        if (next.inProgress) setPollKey(key => key + 1);
      }
    } catch (reason) {
      if (!mounted.current) return;
      setRecovered(true);
      setStartError(`${(reason as Error).message} Checking whether the server started a job.`);
      // A lost POST response is not proof that no work started. Reconnect without resubmitting.
      try {
        const { job: next } = await fetchMemberRoleStatus();
        if (!mounted.current) return;
        updateJob(next);
        if (next?.inProgress) { setStartError(null); setPollKey(key => key + 1); }
      } catch {
        if (mounted.current) {
          setMonitorError("Unable to confirm whether the job started. Retrying status checks; do not submit again.");
          setPollKey(key => key + 1);
        }
      }
    } finally { if (mounted.current) setStarting(false); }
  };

  return {
    job, start, recovered, checking, starting, monitorError, startError, lastCheckedAt,
    busy: checking || starting || !!job?.inProgress || !!monitorError,
    elapsedSeconds: job ? Math.max(0, Math.floor(((job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.startedAt)) / 1000)) : 0,
    rateLimitSeconds: job?.rateLimitedUntil ? Math.max(0, Math.ceil((Date.parse(job.rateLimitedUntil) - now) / 1000)) : 0,
    quietSeconds: job ? Math.max(0, Math.floor((now - Date.parse(job.updatedAt)) / 1000)) : 0,
    reset: () => { if (!jobRef.current?.inProgress) { generation.current++; updateJob(null); setStartError(null); } },
  };
};
