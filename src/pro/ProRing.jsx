import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { acceptChat, declineRequest } from '../lib/chat.js'
import { Loader } from '../components/Cosmos.jsx'
import { useStore } from '../store.jsx'

/**
 * Where a call notification lands (6 Oct 2026). `?do=answer` answers it,
 * `?do=decline` declines it, anything else opens the app with the ringing
 * bar on top. Each does its one thing and moves on, so the back button
 * never returns here to do it twice.
 */
export default function ProRing() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showToast, openChat } = useStore()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const act = params.get('do')
    ;(async () => {
      if (act === 'answer') {
        const r = await acceptChat(id)
        if (!r?.ok) {
          showToast(r?.reason ?? 'That call is no longer waiting.')
          return navigate('/pro/studio', { replace: true })
        }
        if (r.mode === 'chat') {
          navigate('/pro/studio', { replace: true })
          return openChat('live', r.thread_id ?? null)
        }
        return navigate(`/call/${id}`, { replace: true })
      }
      if (act === 'decline') {
        await declineRequest(id)
        showToast('Declined. Nothing was charged.')
      }
      navigate('/pro/studio', { replace: true })
    })()
  }, [id, navigate, openChat, params, showToast])

  return <Loader label="Opening the call" className="py-24" />
}
