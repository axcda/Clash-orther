import { Box, Button, Snackbar, useTheme } from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { nanoid } from 'nanoid'
import { useCallback, useImperativeHandle, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { closeConnection } from 'tauri-plugin-mihomo-api'

import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import parseTraffic from '@/utils/parse-traffic'

export interface ConnectionDetailRef {
  open: (detail: IConnectionsItem, closed: boolean) => void
  close: () => void
}

export function ConnectionDetail({ ref }: { ref?: Ref<ConnectionDetailRef> }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<IConnectionsItem | null>(null)
  const [closed, setClosed] = useState(false)
  const theme = useTheme()

  const onClose = useCallback(() => {
    setOpen(false)
    setDetail(null)
    setClosed(false)
  }, [])

  useImperativeHandle(ref, () => ({
    open: (detail: IConnectionsItem, closed: boolean) => {
      if (open) return
      setOpen(true)
      setDetail(detail)
      setClosed(closed)
    },
    close: onClose,
  }))

  return (
    <Snackbar
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      open={open}
      onClose={onClose}
      sx={{
        '.MuiSnackbarContent-root': {
          maxWidth: '520px',
          maxHeight: '480px',
          overflowY: 'auto',
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
        },
      }}
      message={
        detail ? (
          <InnerConnectionDetail
            data={detail}
            closed={closed}
            onClose={onClose}
          />
        ) : null
      }
    />
  )
}

interface InnerProps {
  data: IConnectionsItem
  closed: boolean
  onClose?: () => void
}

const InnerConnectionDetail = ({ data, closed, onClose }: InnerProps) => {
  const { t } = useTranslation()
  const { metadata, rulePayload } = data
  const theme = useTheme()
  const chains = [...data.chains].reverse().join(' / ')
  const rule = rulePayload ? `${data.rule}(${rulePayload})` : data.rule
  const hostAddress =
    metadata.host || metadata.destinationIP || metadata.remoteDestination
  const host = `${hostAddress}:${metadata.destinationPort}`
  const Destination = metadata.destinationIP
    ? metadata.destinationIP
    : metadata.remoteDestination

  const information = [
    { label: t('connections.components.fields.host'), value: host },
    {
      label: t('shared.labels.downloaded'),
      value: parseTraffic(data.download).join(' '),
    },
    {
      label: t('shared.labels.uploaded'),
      value: parseTraffic(data.upload).join(' '),
    },
    {
      label: t('connections.components.fields.dlSpeed'),
      value: parseTraffic(data.curDownload ?? -1).join(' ') + '/s',
    },
    {
      label: t('connections.components.fields.ulSpeed'),
      value: parseTraffic(data.curUpload ?? -1).join(' ') + '/s',
    },
    {
      label: t('connections.components.fields.chains'),
      value: chains,
    },
    { label: t('connections.components.fields.rule'), value: rule },
    {
      label: t('connections.components.fields.process'),
      value: `${metadata.process}${metadata.processPath ? `(${metadata.processPath})` : ''}`,
    },
    {
      label: t('connections.components.fields.time'),
      value: dayjs(data.start).fromNow(),
    },
    {
      label: t('connections.components.fields.source'),
      value: `${metadata.sourceIP}:${metadata.sourcePort}`,
    },
    {
      label: t('connections.components.fields.destination'),
      value: Destination,
    },
    {
      label: t('connections.components.fields.destinationPort'),
      value: `${metadata.destinationPort}`,
    },
    {
      label: t('connections.components.fields.type'),
      value: `${metadata.type}(${metadata.network})`,
    },
  ]

  const { verge, patchVerge } = useVerge()
  const onDelete = useLockFn(async () => closeConnection(data.id))

  const handleAddProcessRule = useCallback(
    async (target: 'PROXY' | 'DIRECT' = 'PROXY') => {
      const procName = metadata.process?.trim()
      if (!procName) return
      const currentRules = verge?.process_proxy_rules || []
      if (
        currentRules.some(
          (r) => r.name.toLowerCase() === procName.toLowerCase(),
        )
      ) {
        showNotice.info(t('settings.sections.processRules.duplicate'))
        return
      }

      const newRule: IProcessRuleItem = {
        id: nanoid(8),
        name: procName,
        path: metadata.processPath?.trim() || undefined,
        enabled: true,
        target,
      }
      await patchVerge({ process_proxy_rules: [...currentRules, newRule] })
      try {
        await closeConnection(data.id)
      } catch {
        // ignore if connection already terminated
      }
      if (target === 'DIRECT') {
        showNotice.success(
          t('connections.components.actions.directRuleAdded', {
            name: procName,
          }),
        )
      } else {
        showNotice.success(
          t('connections.components.actions.processRuleAdded', {
            name: procName,
          }),
        )
      }
    },
    [
      data.id,
      metadata.process,
      metadata.processPath,
      patchVerge,
      t,
      verge?.process_proxy_rules,
    ],
  )

  return (
    <Box sx={{ userSelect: 'text', color: theme.palette.text.secondary }}>
      {information.map((each) => (
        <div key={each.label}>
          <b>{each.label}</b>
          <span
            style={{
              wordBreak: 'break-all',
              color: theme.palette.text.primary,
            }}
          >
            : {each.value}
          </span>
        </div>
      ))}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          mt: 1.5,
          flexWrap: 'wrap',
        }}
      >
        {Boolean(metadata.process) && (
          <>
            <Button
              variant="outlined"
              size="small"
              color="success"
              onClick={() => handleAddProcessRule('DIRECT')}
            >
              {t('connections.components.actions.addDirectRule')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handleAddProcessRule('PROXY')}
            >
              {t('connections.components.actions.addProcessRule')}
            </Button>
          </>
        )}

        {!closed && (
          <Button
            variant="contained"
            size="small"
            title={t('connections.components.actions.closeConnection')}
            onClick={() => {
              onDelete()
              onClose?.()
            }}
          >
            {t('connections.components.actions.closeConnection')}
          </Button>
        )}
      </Box>
    </Box>
  )
}
