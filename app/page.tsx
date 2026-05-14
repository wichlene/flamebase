'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { useState } from 'react'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'

export default function Home() {
  const { address, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'discover' | 'profile'>('discover')
  const [username, setUsername] = useState('')
  const [txHash, setTxHash] = useState('')
  const { writeContractAsync } = useWriteContract()

  const { data: profile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'profiles',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  const hasProfile = profile && profile[2]

  const createProfile = async () => {
    if (!username) return
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'createProfile',
        args: [username, ''],
      })
      setTxHash(hash)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-950 to-black text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-orange-900">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold text-orange-400">FlameBase</span>
        </div>
        <ConnectButton />
      </header>

      <div className="max-w-md mx-auto px-4 py-8">
        {!isConnected ? (
          <div className="text-center mt-20">
            <div className="text-8xl mb-6">🔥</div>
            <h1 className="text-4xl font-bold text-orange-400 mb-4">FlameBase</h1>
            <p className="text-gray-400 mb-8">On-chain dating on Base. Every like is a transaction.</p>
            <ConnectButton />
          </div>
        ) : (
          <div>
            <p className="text-center text-orange-400 mb-6 text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
              {hasProfile && <span className="ml-2 text-green-400">✓ {profile[0]}</span>}
            </p>
            <div className="flex gap-2 mb-6">
              <button onClick={() => setActiveTab('discover')} className={`flex-1 py-2 rounded-lg font-semibold ${activeTab === 'discover' ? 'bg-orange-500' : 'bg-orange-950 border border-orange-800'}`}>Discover</button>
              <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 rounded-lg font-semibold ${activeTab === 'profile' ? 'bg-orange-500' : 'bg-orange-950 border border-orange-800'}`}>Profile</button>
            </div>
            {activeTab === 'discover' && (
              <div className="bg-orange-950 border border-orange-800 rounded-2xl p-6 text-center">
                <div className="text-6xl mb-4">🔥</div>
                <h2 className="text-xl font-bold mb-2">Discover</h2>
                <p className="text-gray-400">Profiles coming soon...</p>
              </div>
            )}
            {activeTab === 'profile' && (
              <div className="bg-orange-950 border border-orange-800 rounded-2xl p-6">
                {hasProfile ? (
                  <div className="text-center">
                    <div className="text-5xl mb-4">🔥</div>
                    <h2 className="text-xl font-bold text-orange-400">{profile[0]}</h2>
                    <p className="text-gray-400 mt-2">{Number(profile[3])} flames</p>
                    <a href={`https://basescan.org/address/${address}`} target="_blank" className="text-blue-400 text-sm mt-4 block">View on Basescan →</a>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-xl font-bold mb-4 text-orange-400">Create Profile</h2>
                    <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-black border border-orange-800 rounded-lg px-4 py-2 mb-3 text-white" />
                    <button onClick={createProfile} className="w-full bg-orange-500 hover:bg-orange-600 py-2 rounded-lg font-semibold">Create Profile (Free)</button>
                    {txHash && <a href={`https://basescan.org/tx/${txHash}`} target="_blank" className="text-blue-400 text-sm mt-3 block text-center">View tx on Basescan →</a>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}