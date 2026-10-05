import {
  AddRounded,
  AppsRounded,
  DeleteRounded,
  FolderOpenRounded,
  RefreshRounded,
  SearchRounded,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import { nanoid } from 'nanoid'
import type { Ref } from 'react'
import { useCallback, useImperativeHandle, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseEmpty, DialogRef } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import { useProxiesData } from '@/providers/app-data-context'
import { getRunningProcesses } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

export function ProcessRulesViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const { proxyView } = useProxiesData()

  const [open, setOpen] = useState(false)
  const [selectProcOpen, setSelectProcOpen] = useState(false)
  const [manualInputOpen, setManualInputOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualTarget, setManualTarget] = useState('DIRECT')
  const [procAddTarget, setProcAddTarget] = useState<'DIRECT' | 'PROXY'>(
    'DIRECT',
  )
  const [filterTab, setFilterTab] = useState<'all' | 'direct' | 'proxy'>('all')

  const [processList, setProcessList] = useState<IRunningProcessItem[]>([])
  const [procLoading, setProcLoading] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  const rules = useMemo(
    () => verge?.process_proxy_rules || [],
    [verge?.process_proxy_rules],
  )

  // Collect available targets: built-in policies + user proxy groups
  const targetOptions = useMemo(() => {
    const defaultTargets = ['DIRECT', 'PROXY', 'REJECT']
    const groupNames = proxyView?.groups?.map((g) => g.name) || []
    const set = new Set([...defaultTargets, ...groupNames])
    return Array.from(set)
  }, [proxyView?.groups])

  const getTargetLabel = useCallback(
    (target: string) => {
      if (target === 'DIRECT')
        return t('settings.sections.processRules.targetDirect')
      if (target === 'PROXY')
        return t('settings.sections.processRules.targetProxy')
      if (target === 'REJECT')
        return t('settings.sections.processRules.targetReject')
      return target
    },
    [t],
  )

  const saveRules = useCallback(
    async (newRules: IProcessRuleItem[]) => {
      await patchVerge({ process_proxy_rules: newRules })
    },
    [patchVerge],
  )

  const handleAddRule = useCallback(
    async (name: string, path?: string, target = 'DIRECT') => {
      const trimmed = name.trim()
      if (!trimmed) return

      // Avoid duplicate process names
      if (rules.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())) {
        showNotice.info(t('settings.sections.processRules.duplicate'))
        return
      }

      const newRule: IProcessRuleItem = {
        id: nanoid(8),
        name: trimmed,
        enabled: true,
        target,
        path: path?.trim() || undefined,
      }

      await saveRules([...rules, newRule])
      showNotice.success(
        t('settings.sections.processRules.added', {
          name: trimmed,
        }),
      )
    },
    [rules, saveRules, t],
  )

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  // Load running processes
  const handleOpenProcSelector = useLockFn(async () => {
    setSelectProcOpen(true)
    setProcLoading(true)
    setSearchFilter('')
    try {
      const list = await getRunningProcesses()
      setProcessList(list || [])
    } catch (e: any) {
      showNotice.error(
        e?.message || t('settings.sections.processRules.fetchError'),
      )
    } finally {
      setProcLoading(false)
    }
  })

  // Select local .exe via file dialog
  const handleSelectExeFile = useLockFn(async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Executable', extensions: ['exe'] }],
      })
      if (typeof selected === 'string' && selected) {
        const parts = selected.split(/[\\/]/)
        const exeName = parts[parts.length - 1]
        if (exeName) {
          await handleAddRule(exeName, selected, procAddTarget)
        }
      }
    } catch (e: any) {
      showNotice.error(
        e?.message || t('settings.sections.processRules.selectError'),
      )
    }
  })

  const handleToggleRule = async (id: string, enabled: boolean) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled } : r))
    await saveRules(updated)
  }

  const handleChangeTarget = async (id: string, target: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, target } : r))
    await saveRules(updated)
  }

  const handleDeleteRule = async (id: string) => {
    const updated = rules.filter((r) => r.id !== id)
    await saveRules(updated)
  }

  const handleEnableTun = async () => {
    await patchVerge({ enable_tun_mode: true })
    showNotice.success(t('settings.sections.processRules.tunEnabled'))
  }

  const filteredProcesses = useMemo(() => {
    if (!searchFilter.trim()) return processList
    const kw = searchFilter.toLowerCase()
    return processList.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        (p.path && p.path.toLowerCase().includes(kw)),
    )
  }, [processList, searchFilter])

  const displayedRules = useMemo(() => {
    if (filterTab === 'direct') {
      return rules.filter((r) => r.target === 'DIRECT')
    }
    if (filterTab === 'proxy') {
      return rules.filter((r) => r.target !== 'DIRECT')
    }
    return rules
  }, [filterTab, rules])

  return (
    <>
      <BaseDialog
        open={open}
        title={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>{t('settings.sections.processRules.title')}</span>
              {rules.length > 0 && (
                <Chip
                  label={`${rules.filter((r) => r.enabled).length}/${rules.length}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 20, fontSize: 11 }}
                />
              )}
            </Box>
          </Box>
        }
        contentSx={{ width: { xs: 360, sm: 540, md: 620 }, px: 3, py: 2 }}
        disableOk
        cancelBtn={t('shared.actions.close')}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* TUN Mode notice */}
          {!verge?.enable_tun_mode && (
            <Alert
              severity="warning"
              variant="outlined"
              sx={{
                py: 0.5,
                px: 1.5,
                alignItems: 'center',
                borderRadius: 2,
                fontSize: 13,
                '.MuiAlert-message': { py: 0.25 },
                '.MuiAlert-action': { pt: 0, mr: 0 },
              }}
              action={
                <Button
                  color="warning"
                  size="small"
                  variant="contained"
                  onClick={handleEnableTun}
                  sx={{
                    textTransform: 'none',
                    py: 0.4,
                    px: 1.2,
                    fontSize: 12,
                    boxShadow: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('settings.sections.processRules.enableTun')}
                </Button>
              }
            >
              {t('settings.sections.processRules.tunWarning')}
            </Alert>
          )}

          {/* Action buttons */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              '& .MuiButton-root': {
                textTransform: 'none',
                borderRadius: 1.5,
              },
            }}
          >
            <Button
              variant="contained"
              size="small"
              startIcon={<AppsRounded />}
              onClick={handleOpenProcSelector}
              sx={{ boxShadow: 'none' }}
            >
              {t('settings.sections.processRules.addRunning')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderOpenRounded />}
              onClick={handleSelectExeFile}
            >
              {t('settings.sections.processRules.browseExe')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddRounded />}
              onClick={() => setManualInputOpen(true)}
            >
              {t('settings.sections.processRules.manualAdd')}
            </Button>
          </Box>

          <Divider />

          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              lineHeight: 1.5,
              px: 0.5,
            }}
          >
            {t('settings.sections.processRules.diagnosticTip')}
          </Typography>

          {/* Filter tabs if rules exist */}
          {rules.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                label={`${t('settings.sections.processRules.filterAll')} (${rules.length})`}
                size="small"
                clickable
                color={filterTab === 'all' ? 'primary' : 'default'}
                variant={filterTab === 'all' ? 'filled' : 'outlined'}
                onClick={() => setFilterTab('all')}
                sx={{ height: 24, fontSize: 11 }}
              />
              <Chip
                label={`${t('settings.sections.processRules.filterDirect')} (${rules.filter((r) => r.target === 'DIRECT').length})`}
                size="small"
                clickable
                color={filterTab === 'direct' ? 'success' : 'default'}
                variant={filterTab === 'direct' ? 'filled' : 'outlined'}
                onClick={() => setFilterTab('direct')}
                sx={{ height: 24, fontSize: 11 }}
              />
              <Chip
                label={`${t('settings.sections.processRules.filterProxy')} (${rules.filter((r) => r.target !== 'DIRECT').length})`}
                size="small"
                clickable
                color={filterTab === 'proxy' ? 'primary' : 'default'}
                variant={filterTab === 'proxy' ? 'filled' : 'outlined'}
                onClick={() => setFilterTab('proxy')}
                sx={{ height: 24, fontSize: 11 }}
              />
            </Box>
          )}

          {/* Rules list */}
          {rules.length === 0 ? (
            <Box
              sx={{
                py: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BaseEmpty text={t('settings.sections.processRules.empty')} />
            </Box>
          ) : displayedRules.length === 0 ? (
            <Box
              sx={{
                py: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BaseEmpty
                text={t('settings.sections.processRules.noProcFound')}
              />
            </Box>
          ) : (
            <List disablePadding sx={{ maxHeight: 420, overflowY: 'auto' }}>
              {displayedRules.map((rule) => {
                const isDirect = rule.target === 'DIRECT'
                return (
                  <ListItem
                    key={rule.id}
                    sx={{
                      px: 1.5,
                      py: 1,
                      mb: 1,
                      borderRadius: 2,
                      bgcolor: 'action.hover',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                    }}
                  >
                    <Switch
                      size="small"
                      checked={rule.enabled}
                      onChange={(e) =>
                        handleToggleRule(rule.id, e.target.checked)
                      }
                    />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                        }}
                      >
                        <Tooltip
                          title={rule.path || rule.name}
                          placement="top"
                          arrow
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {rule.name}
                          </Typography>
                        </Tooltip>
                        <Chip
                          label={
                            isDirect
                              ? t('settings.sections.processRules.targetDirect')
                              : rule.target === 'PROXY'
                                ? t(
                                    'settings.sections.processRules.targetProxy',
                                  )
                                : rule.target
                          }
                          size="small"
                          color={isDirect ? 'success' : 'primary'}
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10, flexShrink: 0 }}
                        />
                      </Box>
                      {rule.path && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11,
                          }}
                        >
                          {rule.path}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Select
                        size="small"
                        value={
                          targetOptions.includes(rule.target)
                            ? rule.target
                            : 'DIRECT'
                        }
                        onChange={(e) =>
                          handleChangeTarget(rule.id, e.target.value)
                        }
                        sx={{ minWidth: 140, height: 32, fontSize: 12 }}
                      >
                        {targetOptions.map((opt) => (
                          <MenuItem key={opt} value={opt} sx={{ fontSize: 12 }}>
                            {getTargetLabel(opt)}
                          </MenuItem>
                        ))}
                      </Select>

                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteRule(rule.id)}
                        sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                      >
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItem>
                )
              })}
            </List>
          )}
        </Box>
      </BaseDialog>

      {/* Select Running Process Dialog */}
      <Dialog
        open={selectProcOpen}
        onClose={() => setSelectProcOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            pb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('settings.sections.processRules.selectRunningTitle')}</span>
          <IconButton
            size="small"
            onClick={handleOpenProcSelector}
            disabled={procLoading}
          >
            <RefreshRounded fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontSize: 13, color: 'text.secondary' }}
            >
              {t('settings.sections.processRules.addModeLabel')}:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                label={t('settings.sections.processRules.targetDirect')}
                clickable
                size="small"
                color={procAddTarget === 'DIRECT' ? 'success' : 'default'}
                variant={procAddTarget === 'DIRECT' ? 'filled' : 'outlined'}
                onClick={() => setProcAddTarget('DIRECT')}
                sx={{ fontWeight: procAddTarget === 'DIRECT' ? 600 : 400 }}
              />
              <Chip
                label={t('settings.sections.processRules.targetProxy')}
                clickable
                size="small"
                color={procAddTarget === 'PROXY' ? 'primary' : 'default'}
                variant={procAddTarget === 'PROXY' ? 'filled' : 'outlined'}
                onClick={() => setProcAddTarget('PROXY')}
                sx={{ fontWeight: procAddTarget === 'PROXY' ? 600 : 400 }}
              />
            </Box>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder={t('settings.sections.processRules.searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 1.5 }}
          />

          {procLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : filteredProcesses.length === 0 ? (
            <BaseEmpty text={t('settings.sections.processRules.noProcFound')} />
          ) : (
            <List disablePadding sx={{ maxHeight: 380, overflowY: 'auto' }}>
              {filteredProcesses.map((proc) => {
                const existingRule = rules.find(
                  (r) => r.name.toLowerCase() === proc.name.toLowerCase(),
                )
                const isAdded = Boolean(existingRule)
                return (
                  <ListItemButton
                    key={`${proc.pid}-${proc.name}`}
                    disabled={isAdded}
                    onClick={() => {
                      handleAddRule(proc.name, proc.path, procAddTarget)
                      setSelectProcOpen(false)
                    }}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {proc.name}
                        </Typography>
                        <Chip
                          label={`PID: ${proc.pid}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      </Box>
                      {proc.path && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {proc.path}
                        </Typography>
                      )}
                    </Box>

                    {isAdded && (
                      <Chip
                        label={
                          existingRule?.target === 'DIRECT'
                            ? t('settings.sections.processRules.targetDirect')
                            : t('settings.sections.processRules.targetProxy')
                        }
                        size="small"
                        color={
                          existingRule?.target === 'DIRECT'
                            ? 'success'
                            : 'primary'
                        }
                        variant="outlined"
                        sx={{ height: 22, fontSize: 11 }}
                      />
                    )}
                  </ListItemButton>
                )
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none' }}
            onClick={() => setSelectProcOpen(false)}
          >
            {t('shared.actions.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manual Input Dialog */}
      <Dialog
        open={manualInputOpen}
        onClose={() => setManualInputOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {t('settings.sections.processRules.manualAddTitle')}
        </DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t('settings.sections.processRules.procNameLabel')}
            placeholder="chrome.exe"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <Select
            fullWidth
            size="small"
            value={manualTarget}
            onChange={(e) => setManualTarget(e.target.value)}
          >
            {targetOptions.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {getTargetLabel(opt)}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none' }}
            onClick={() => setManualInputOpen(false)}
          >
            {t('shared.actions.cancel')}
          </Button>
          <Button
            variant="contained"
            size="small"
            sx={{ textTransform: 'none', boxShadow: 'none' }}
            disabled={!manualName.trim()}
            onClick={() => {
              handleAddRule(manualName, undefined, manualTarget)
              setManualName('')
              setManualInputOpen(false)
            }}
          >
            {t('shared.actions.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
