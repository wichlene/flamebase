'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useConnect } from 'wagmi'
import { base } from 'wagmi/chains'
import Link from 'next/link'
import { useSafeSend } from '../../lib/useSafeSend'

interface TxCall {
  to: string
  data: string
  value?: string
}

interface TxPayload {
  chain: string
  calls: TxCall[]
  description?: string
}

function ApproveContent() {
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const safeSend = useSafeSend()

  const [payload, setPayload] = useState<TxPayload | null>(null)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const raw = searchParams.get('tx')
    if (!raw) { setDecodeError('tx parametresi eksik'); return }
    try {
      const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
      setPayload(JSON.parse(json))
    } catch {
      setDecodeError('İşlem verisi okunamadı')
    }
  }, [searchParams])

  if (decodeError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow p-6 max-w-sm w-full text-center">
        <p className="text-red-500 font-medium">{decodeError}</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 text-sm">← FlameBase'e dön</Link>
      </div>
    </div>
  )

  if (!payload) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const call = payload.calls[0]
  const valueEth = call.value
    ? (Number(BigInt(call.value)) / 1e18).toFixed(6).replace(/\.?0+$/, '')
    : '0'

  const ACTION_LABELS: Record<string, string> = {
    createPost: 'Post Oluştur',
    like: 'Beğen',
    comment: 'Yorum Yap',
    tip: 'Bahşiş Ver',
    checkIn: 'Check-In',
    deployToken: 'Token Oluştur',
    propose: 'Teklif Sun',
    vote: 'Oy Ver',
  }

  const actionName = payload.description || 'FlameBase İşlemi'

  async function handleApprove() {
    if (!call) return
    setStatus('pending')
    setErrMsg('')
    try {
      const hash = await safeSend({
        to: call.to as `0x${string}`,
        data: call.data as `0x${string}`,
        value: call.value ? BigInt(call.value) : undefined,
      })
      setTxHash(hash)
      setStatus('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata'
      const rejected = /user rejected|user denied|rejected the request/i.test(msg)
      const friendly = rejected
        ? 'İşlem cüzdanda iptal edildi.'
        : msg.startsWith('CONTRACT_REVERT:') ? msg.slice('CONTRACT_REVERT:'.length).trim()
        : msg.startsWith('PENDING_UNCONFIRMED:') ? 'İşlem onaylanamadı — sonucu Basescan\'de kontrol et, tekrar denemeden önce.'
        : msg.slice(0, 140)
      setErrMsg(friendly)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="FlameBase" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-bold text-gray-900">FlameBase</h1>
            <p className="text-xs text-gray-500">İşlem Onayı</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">İşlem</span>
            <span className="font-medium">{actionName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ağ</span>
            <span className="font-medium">Base Mainnet</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Değer</span>
            <span className="font-medium">{valueEth} ETH</span>
          </div>
          {isConnected && address && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cüzdan</span>
              <span className="font-mono text-xs">{address.slice(0, 6)}…{address.slice(-4)}</span>
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 text-center">Onaylamak için cüzdanını bağla</p>
            {connectors.slice(0, 3).map(c => (
              <button
                key={c.id}
                onClick={() => connect({ connector: c, chainId: base.id })}
                className="w-full py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {c.name} ile bağlan
              </button>
            ))}
          </div>
        ) : status === 'success' ? (
          <div className="text-center space-y-2">
            <div className="text-green-500 text-3xl">✓</div>
            <p className="font-medium text-gray-900">İşlem Onaylandı!</p>
            {txHash && (
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 text-sm underline"
              >
                Basescan'de görüntüle ↗
              </a>
            )}
            <Link href="/" className="block mt-2 text-sm text-gray-500">← FlameBase'e dön</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {status === 'error' && (
              <p className="text-red-500 text-xs text-center">{errMsg}</p>
            )}
            <button
              onClick={handleApprove}
              disabled={status === 'pending'}
              className="w-full py-3 px-4 bg-[#0052FF] text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {status === 'pending' ? 'Cüzdan bekleniyor…' : status === 'error' ? 'Tekrar dene' : `Onayla — ${valueEth} ETH`}
            </button>
            <Link href="/" className="block text-center text-gray-400 text-xs">İptal</Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ApprovePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ApproveContent />
    </Suspense>
  )
}
