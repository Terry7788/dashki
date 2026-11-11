/// <reference types="vite/client" />

// Next's <style jsx> blocks in the web pages (compiled by styled-jsx/babel).
import 'react';
declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
