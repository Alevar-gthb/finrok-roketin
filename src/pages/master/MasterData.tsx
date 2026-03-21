import { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useClients, useServices, useNotesTemplates, useUpsertClient, useUpsertService, useUpsertNotesTemplate } from '@/hooks/useFinrok'
import { PageHeader, Button, Input, Select, Textarea, Modal, EmptyState, LoadingSpinner } from '@/components/shared'
import { generateClientCode } from '@/lib/utils'
import type { Client, Service, NotesTemplate } from '@/types/database'
import { Plus, Edit2, Building2, Briefcase, FileText } from 'lucide-react'

export default function MasterData() {
  const loc = useLocation()
  const tabs = [
    { to: '/master',          label: 'Clients',   icon: Building2 },
    { to: '/master/services', label: 'Services',  icon: Briefcase },
    { to: '/master/notes',    label: 'Notes Templates', icon: FileText },
  ]
  return (
    <div className="page">
      <PageHeader title="Master Data" sub="Kelola data induk aplikasi" />
      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {tabs.map(t => {
          const active = t.to === '/master' ? loc.pathname === '/master' : loc.pathname.startsWith(t.to)
          const Icon = t.icon
          return (
            <NavLink key={t.to} to={t.to} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${active ? 'border-rok-500 text-rok-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon size={13} />{t.label}
            </NavLink>
          )
        })}
      </div>
      <Routes>
        <Route index element={<ClientsTab />} />
        <Route path="services" element={<ServicesTab />} />
        <Route path="notes" element={<NotesTab />} />
      </Routes>
    </div>
  )
}

function ClientsTab() {
  const { data: clients, isLoading } = useClients(false)
  const upsert = useUpsertClient()
  const [modal, setModal] = useState<Partial<Client> | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => { setForm({ is_active: true }); setModal({}) }
  const openEdit   = (c: Client) => { setForm(c); setModal(c) }
  const handleSave = async () => {
    const code = form.code || generateClientCode(form.name ?? '')
    await upsert.mutateAsync({ ...form, name: form.name!, code } as any)
    setModal(null)
  }

  if (isLoading) return <LoadingSpinner />
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={openCreate}><Plus size={13} /> Tambah Client</Button>
      </div>
      {!clients?.length ? <EmptyState title="Belum ada client" action={<Button onClick={openCreate}><Plus size={13} /> Tambah</Button>} /> : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead><tr className="bg-secondary/40 border-b border-border">{['Kode','Nama','PIC','Kota','Email','Telp','Status','Aksi'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-rok-700">{c.code}</td>
                  <td className="px-4 py-2.5 text-xs font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.pic_name ?? '-'}</td>
                  <td className="px-4 py-2.5 text-xs">{c.city ?? '-'}</td>
                  <td className="px-4 py-2.5 text-xs">{c.email ?? '-'}</td>
                  <td className="px-4 py-2.5 text-xs">{c.phone ?? '-'}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${c.is_active?'bg-green-50 text-green-700':'bg-secondary text-muted-foreground'}`}>{c.is_active?'Aktif':'Nonaktif'}</span></td>
                  <td className="px-4 py-2.5"><button onClick={() => openEdit(c)} className="text-xs text-rok-600 hover:underline flex items-center gap-1"><Edit2 size={11} /> Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal !== null && (
        <Modal open title={form.id ? 'Edit Client' : 'Tambah Client'} onClose={() => setModal(null)} width="max-w-xl">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nama Perusahaan *" value={form.name ?? ''} onChange={e => { set('name', e.target.value); if (!form.id) set('code', generateClientCode(e.target.value)) }} />
              <Input label="Kode Client *" value={form.code ?? ''} onChange={e => set('code', e.target.value.toUpperCase())} />
            </div>
            <Input label="Nama PIC" value={form.pic_name ?? ''} onChange={e => set('pic_name', e.target.value)} />
            <Textarea label="Alamat" rows={2} value={form.address ?? ''} onChange={e => set('address', e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Kota" value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
              <Input label="Provinsi" value={form.province ?? ''} onChange={e => set('province', e.target.value)} />
              <Input label="Kode Pos" value={form.postal_code ?? ''} onChange={e => set('postal_code', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
              <Input label="Telepon" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
            </div>
            <Input label="NPWP" value={form.npwp ?? ''} onChange={e => set('npwp', e.target.value)} />
            <Select label="Status" value={form.is_active ? 'true' : 'false'} onChange={e => set('is_active', e.target.value === 'true')}>
              <option value="true">Aktif</option><option value="false">Nonaktif</option>
            </Select>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
              <Button onClick={handleSave} loading={upsert.isPending} disabled={!form.name}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function ServicesTab() {
  const { data: services, isLoading } = useServices()
  const upsert = useUpsertService()
  const [modal, setModal] = useState<Partial<Service> | null>(null)
  const [form, setForm] = useState<Partial<Service>>({})
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  if (isLoading) return <LoadingSpinner />
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => { setForm({ is_active: true }); setModal({}) }}><Plus size={13} /> Tambah Service</Button>
      </div>
      {!services?.length ? <EmptyState title="Belum ada service" /> : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead><tr className="bg-secondary/40 border-b border-border">{['Kode','Nama','Deskripsi','Status','Aksi'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody>{services.map((s, i) => (
              <tr key={s.id} className={`border-b border-border last:border-0 hover:bg-rok-50/30 ${i%2===0?'bg-white':'bg-secondary/10'}`}>
                <td className="px-4 py-2.5 font-mono text-xs font-medium text-rok-700">{s.code}</td>
                <td className="px-4 py-2.5 text-xs font-medium">{s.name}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.description ?? '-'}</td>
                <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${s.is_active?'bg-green-50 text-green-700':'bg-secondary text-muted-foreground'}`}>{s.is_active?'Aktif':'Nonaktif'}</span></td>
                <td className="px-4 py-2.5"><button onClick={() => { setForm(s); setModal(s) }} className="text-xs text-rok-600 hover:underline flex items-center gap-1"><Edit2 size={11} /> Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {modal !== null && (
        <Modal open title={form.id ? 'Edit Service' : 'Tambah Service'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kode *" placeholder="DESIGN, OS-UIUX" value={form.code ?? ''} onChange={e => set('code', e.target.value.toUpperCase())} />
              <Input label="Nama *" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
            </div>
            <Textarea label="Deskripsi" rows={2} value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
            <Select label="Status" value={form.is_active ? 'true' : 'false'} onChange={e => set('is_active', e.target.value === 'true')}>
              <option value="true">Aktif</option><option value="false">Nonaktif</option>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
              <Button onClick={async () => { await upsert.mutateAsync({ ...form, name: form.name!, code: form.code! } as any); setModal(null) }} loading={upsert.isPending} disabled={!form.name || !form.code}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function NotesTab() {
  const { data: templates, isLoading } = useNotesTemplates()
  const upsert = useUpsertNotesTemplate()
  const [modal, setModal] = useState<Partial<NotesTemplate> | null>(null)
  const [form, setForm] = useState<Partial<NotesTemplate>>({})
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  if (isLoading) return <LoadingSpinner />
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => { setForm({ is_active: true }); setModal({}) }}><Plus size={13} /> Tambah Template</Button>
      </div>
      {!templates?.length ? <EmptyState title="Belum ada template" /> : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-mono text-xs text-rok-700 font-medium mr-2">{t.code}</span>
                  <span className="text-sm font-medium">{t.name}</span>
                </div>
                <button onClick={() => { setForm(t); setModal(t) }} className="text-xs text-rok-600 hover:underline flex items-center gap-1"><Edit2 size={11} /> Edit</button>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{t.content}</p>
            </div>
          ))}
        </div>
      )}
      {modal !== null && (
        <Modal open title={form.id ? 'Edit Template' : 'Tambah Template'} onClose={() => setModal(null)} width="max-w-2xl">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kode *" placeholder="DEFAULT, KAI-TERMS" value={form.code ?? ''} onChange={e => set('code', e.target.value.toUpperCase())} />
              <Input label="Nama *" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
            </div>
            <Textarea label="Isi Terms *" rows={10} value={form.content ?? ''} onChange={e => set('content', e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
              <Button onClick={async () => { await upsert.mutateAsync({ ...form, code: form.code!, name: form.name!, content: form.content! } as any); setModal(null) }} loading={upsert.isPending} disabled={!form.code || !form.name || !form.content}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
