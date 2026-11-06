import { ref } from 'vue'
import { api } from '@/lib/api'
import type { ApiKeyScope, ApiKeySummary, CreatedApiKey } from '@bookorbit/types'

const keys = ref<ApiKeySummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

export function useApiKeys() {
  async function loadKeys() {
    loading.value = true
    error.value = null
    try {
      const res = await api('/api/v1/api-keys')
      if (!res.ok) throw new Error('Failed to load API keys')
      keys.value = await res.json()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading.value = false
    }
  }

  async function createKey(data: { name: string; scopes: ApiKeyScope[]; expiresAt?: string }): Promise<CreatedApiKey> {
    const res = await api('/api/v1/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to create API key')
    }
    const result: CreatedApiKey = await res.json()
    await loadKeys()
    return result
  }

  async function revokeKey(id: number) {
    const res = await api(`/api/v1/api-keys/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to revoke API key')
    }
    await loadKeys()
  }

  return { keys, loading, error, loadKeys, createKey, revokeKey }
}
