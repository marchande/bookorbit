<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, KeyRound, Plus, Trash2 } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { API_KEY_READ_SCOPE, Permission, PERMISSION_LABELS, type ApiKeyScope, type ApiKeySummary } from '@bookorbit/types'
import { formatDate as formatLocaleDate } from '@/i18n/formatters'
import { copyToClipboard } from '@/lib/clipboard'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApiKeys } from '@/features/settings/composables/useApiKeys'
import SettingsPageHeader from '@/features/settings/SettingsPageHeader.vue'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const { t } = useI18n()
const { user } = useAuth()
const { keys, loading, error, loadKeys, createKey, revokeKey } = useApiKeys()

const showCreateForm = ref(false)
const createName = ref('')
const createScopes = ref<ApiKeyScope[]>([])
const createExpiresAt = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

/** The full key, shown once right after creation and forgotten when the dialog closes. */
const revealedToken = ref<string | null>(null)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const revokeConfirmId = ref<number | null>(null)
const revoking = ref(false)

/** Only scopes the signed-in user holds can be granted; the server enforces the same rule. */
const grantableScopes = computed<ApiKeyScope[]>(() => {
  const current = user.value
  if (!current) return []
  const held = Object.values(Permission).filter(
    (permission) => permission !== Permission.DemoRestricted && (current.isSuperuser || current.permissions.includes(permission)),
  )
  return [API_KEY_READ_SCOPE, ...held]
})

const isLive = (key: ApiKeySummary) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date())
const liveKeys = computed(() => keys.value.filter(isLive))
const deadKeys = computed(() => keys.value.filter((key) => !isLive(key)))
const canCreate = computed(() => !creating.value && createName.value.trim().length > 0 && createScopes.value.length > 0)

function scopeLabel(scope: ApiKeyScope): string {
  if (scope === API_KEY_READ_SCOPE) return t('settings.apiKeys.readScope')
  return PERMISSION_LABELS[scope] ?? scope
}

function formatDate(value: string | null): string {
  return value ? formatLocaleDate(new Date(value)) : t('settings.apiKeys.never')
}

function openCreateForm() {
  createName.value = ''
  createScopes.value = []
  createExpiresAt.value = ''
  createError.value = null
  showCreateForm.value = true
}

async function handleCreate() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = null
  try {
    const created = await createKey({
      name: createName.value.trim(),
      scopes: createScopes.value,
      ...(createExpiresAt.value ? { expiresAt: new Date(`${createExpiresAt.value}T23:59:59`).toISOString() } : {}),
    })
    showCreateForm.value = false
    revealedToken.value = created.token
  } catch (e) {
    createError.value = e instanceof Error ? e.message : t('settings.apiKeys.createFailed')
  } finally {
    creating.value = false
  }
}

async function copyToken() {
  if (!revealedToken.value) return
  await copyToClipboard(revealedToken.value)
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 2000)
}

function closeReveal(open: boolean) {
  if (!open) {
    revealedToken.value = null
    copied.value = false
  }
}

async function confirmRevoke() {
  if (revokeConfirmId.value === null) return
  revoking.value = true
  try {
    await revokeKey(revokeConfirmId.value)
    revokeConfirmId.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('settings.apiKeys.revokeFailed')
  } finally {
    revoking.value = false
  }
}

onMounted(loadKeys)
onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <SettingsPageHeader :title="t('settings.apiKeys.title')" :subtitle="t('settings.apiKeys.subtitle')">
    <Button size="sm" type="button" data-testid="api-key-create" @click="openCreateForm">
      <Plus :size="14" aria-hidden="true" />
      {{ t('settings.apiKeys.create') }}
    </Button>
  </SettingsPageHeader>

  <p class="mb-4 text-sm text-muted-foreground">{{ t('settings.apiKeys.explainer') }}</p>

  <p v-if="error" role="alert" class="settings-error-state">{{ error }}</p>
  <p v-if="loading" role="status" class="settings-loading-state">{{ t('common.loading') }}</p>

  <p v-if="!loading && keys.length === 0" class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
    {{ t('settings.apiKeys.empty') }}
  </p>

  <ul v-if="liveKeys.length" class="space-y-3" data-testid="api-key-list">
    <li v-for="key in liveKeys" :key="key.id" class="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="flex items-center gap-2 font-medium text-foreground">
            <KeyRound :size="15" class="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="truncate">{{ key.name }}</span>
            <code class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{{ key.keyPrefix }}…</code>
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t('settings.apiKeys.created') }} {{ formatDate(key.createdAt) }} · {{ t('settings.apiKeys.lastUsed') }}
            {{ formatDate(key.lastUsedAt) }} · {{ t('settings.apiKeys.expires') }} {{ formatDate(key.expiresAt) }}
          </p>
        </div>
        <Button size="sm" variant="outline" type="button" :aria-label="t('settings.apiKeys.revoke')" @click="revokeConfirmId = key.id">
          <Trash2 :size="14" aria-hidden="true" />
          {{ t('settings.apiKeys.revoke') }}
        </Button>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <span
          v-for="scope in key.scopes"
          :key="scope"
          class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          {{ scopeLabel(scope) }}
        </span>
      </div>
    </li>
  </ul>

  <details v-if="deadKeys.length" class="mt-6 text-sm">
    <summary class="cursor-pointer text-muted-foreground">{{ t('settings.apiKeys.inactive', { count: deadKeys.length }) }}</summary>
    <ul class="mt-2 space-y-1 text-muted-foreground">
      <li v-for="key in deadKeys" :key="key.id">
        {{ key.name }} <code class="text-xs">{{ key.keyPrefix }}…</code> ·
        {{
          key.revokedAt
            ? t('settings.apiKeys.revokedOn', { date: formatDate(key.revokedAt) })
            : t('settings.apiKeys.expiredOn', { date: formatDate(key.expiresAt) })
        }}
      </li>
    </ul>
  </details>

  <DialogRoot :open="showCreateForm" @update:open="(open: boolean) => (showCreateForm = open)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-scrim" />
      <DialogContent
        aria-modal="true"
        class="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DialogTitle class="text-lg font-semibold text-foreground">{{ t('settings.apiKeys.createDialog.title') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('settings.apiKeys.createDialog.description') }}</DialogDescription>

        <form class="mt-4 space-y-4" @submit.prevent="handleCreate">
          <div>
            <label for="api-key-name" class="mb-1 block text-sm font-medium text-foreground">{{ t('settings.apiKeys.createDialog.name') }}</label>
            <input
              id="api-key-name"
              v-model="createName"
              type="text"
              maxlength="100"
              class="input-field w-full"
              :placeholder="t('settings.apiKeys.createDialog.namePlaceholder')"
            />
          </div>

          <fieldset>
            <legend class="mb-1 text-sm font-medium text-foreground">{{ t('settings.apiKeys.createDialog.scopes') }}</legend>
            <p class="mb-2 text-xs text-muted-foreground">{{ t('settings.apiKeys.createDialog.scopesHint') }}</p>
            <div class="grid gap-1.5 sm:grid-cols-2">
              <label v-for="scope in grantableScopes" :key="scope" class="flex items-center gap-2 text-sm text-foreground">
                <input v-model="createScopes" type="checkbox" :value="scope" :data-testid="`api-key-scope-${scope}`" />
                {{ scopeLabel(scope) }}
              </label>
            </div>
          </fieldset>

          <div>
            <label for="api-key-expires" class="mb-1 block text-sm font-medium text-foreground">{{
              t('settings.apiKeys.createDialog.expires')
            }}</label>
            <input id="api-key-expires" v-model="createExpiresAt" type="date" class="input-field w-full" />
            <p class="mt-1 text-xs text-muted-foreground">{{ t('settings.apiKeys.createDialog.expiresHint') }}</p>
          </div>

          <p v-if="createError" role="alert" class="text-sm text-destructive">{{ createError }}</p>

          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" @click="showCreateForm = false">{{ t('common.cancel') }}</Button>
            <Button type="submit" size="sm" :disabled="!canCreate">{{ t('settings.apiKeys.create') }}</Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot :open="revealedToken !== null" @update:open="closeReveal">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-scrim" />
      <DialogContent
        aria-modal="true"
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DialogTitle class="text-lg font-semibold text-foreground">{{ t('settings.apiKeys.reveal.title') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('settings.apiKeys.reveal.description') }}</DialogDescription>
        <div class="mt-4 flex items-center gap-2">
          <code
            data-testid="api-key-token"
            class="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground select-all"
            >{{ revealedToken }}</code
          >
          <Button size="sm" type="button" variant="outline" :aria-label="t('settings.apiKeys.reveal.copy')" @click="copyToken">
            <Check v-if="copied" :size="14" aria-hidden="true" />
            <Copy v-else :size="14" aria-hidden="true" />
          </Button>
        </div>
        <div class="mt-4 flex justify-end">
          <Button size="sm" type="button" @click="closeReveal(false)">{{ t('settings.apiKeys.reveal.done') }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <ConfirmDialog
    :open="revokeConfirmId !== null"
    :title="t('settings.apiKeys.revokeDialog.title')"
    :description="t('settings.apiKeys.revokeDialog.description')"
    :confirm-label="t('settings.apiKeys.revoke')"
    :busy="revoking"
    destructive
    @confirm="confirmRevoke"
    @cancel="revokeConfirmId = null"
  />
</template>
