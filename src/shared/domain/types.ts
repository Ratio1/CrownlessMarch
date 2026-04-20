export interface PresencePosition {
  x: number;
  y: number;
}

export interface PresenceLease {
  current_character_cid: string;
  shard_world_instance_id: string;
  session_host_node_id: string;
  connection_id: string;
  position: PresencePosition | null;
  buffs_debuffs: string[];
  lease_expires_at: string;
  last_persisted_at: string | null;
  persist_revision: number;
}
