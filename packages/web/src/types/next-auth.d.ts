import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    argosToken: string
  }

  interface User {
    argosToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    argosToken?: string
  }
}
