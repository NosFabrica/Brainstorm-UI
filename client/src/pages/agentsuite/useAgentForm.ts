import { useCallback, useState } from "react";
import type { AgentState } from "../userPanelState";

/**
 * The assistant's profile as typed, seeded from what this device stored, and
 * the two shapes it goes out in: the kind-0 payload the backend publishes and
 * the update to the stored state.
 */
export function useAgentForm(stored: AgentState) {
  const [agentNameInput, setAgentNameInput] = useState(stored.name);
  const [agentDescInput, setAgentDescInput] = useState(stored.description);
  const [agentPictureInput, setAgentPictureInput] = useState(stored.picture);
  const [agentBannerInput, setAgentBannerInput] = useState(stored.banner);
  const [agentLud16Input, setAgentLud16Input] = useState(stored.lud16);
  const [agentNip05Input, setAgentNip05Input] = useState(stored.nip05);
  const [agentWebsiteInput, setAgentWebsiteInput] = useState(stored.website);

  const getProfilePayload = useCallback(
    () => ({
      name: agentNameInput.trim(),
      about: agentDescInput.trim(),
      picture: agentPictureInput,
      banner: agentBannerInput,
      lud16: agentLud16Input.trim(),
      nip05: agentNip05Input.trim(),
      website: agentWebsiteInput.trim(),
    }),
    [
      agentNameInput,
      agentDescInput,
      agentPictureInput,
      agentBannerInput,
      agentLud16Input,
      agentNip05Input,
      agentWebsiteInput,
    ],
  );

  const getAgentStateUpdates = useCallback(
    () => ({
      name: agentNameInput.trim(),
      description: agentDescInput.trim(),
      picture: agentPictureInput,
      banner: agentBannerInput,
      lud16: agentLud16Input.trim(),
      nip05: agentNip05Input.trim(),
      website: agentWebsiteInput.trim(),
    }),
    [
      agentNameInput,
      agentDescInput,
      agentPictureInput,
      agentBannerInput,
      agentLud16Input,
      agentNip05Input,
      agentWebsiteInput,
    ],
  );

  return {
    agentNameInput,
    setAgentNameInput,
    agentDescInput,
    setAgentDescInput,
    agentPictureInput,
    setAgentPictureInput,
    agentBannerInput,
    setAgentBannerInput,
    agentLud16Input,
    setAgentLud16Input,
    agentNip05Input,
    setAgentNip05Input,
    agentWebsiteInput,
    setAgentWebsiteInput,
    getProfilePayload,
    getAgentStateUpdates,
  };
}

export type AgentForm = ReturnType<typeof useAgentForm>;
