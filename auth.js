import { supabase } from './supabase.js'

export async function signUp(email, password, name, type) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error }

  await supabase.from('profiles').insert({
    id: data.user.id,
    name,
    type
  })

  return { data, error: null }
}

export async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  })
  return { data, error }
}

export async function logOut() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}