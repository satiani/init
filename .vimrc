" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker
if &compatible
  set nocompatible               " Be iMproved
endif

" Required:
set runtimepath+=~/.cache/dein/repos/github.com/Shougo/dein.vim
set runtimepath+=.
" }}}
" dein init {{{
" Required:
if dein#load_state('~/.cache/dein')
  call dein#begin('~/.cache/dein')

  " Let dein manage dein
  " Required:
  call dein#add('~/.cache/dein/repos/github.com/Shougo/dein.vim')
  " }}}
" 3rd party plugins
  " Snippets {{{
  call dein#add('SirVer/ultisnips')
  call dein#add('honza/vim-snippets')
  " }}}
  " Syntax {{{
  call dein#add('isRuslan/vim-es6')
  call dein#add('ap/vim-css-color')
  call dein#add('lepture/vim-jinja')
  call dein#add('mklabs/vim-backbone')
  call dein#add('aaronj1335/underscore-templates.vim')
  call dein#add('Yggdroot/indentLine')
  " }}}
  " Navigation {{{
  if executable('fzf')
    call dein#add('junegunn/fzf', { 'build': './install' })
    call dein#add('junegunn/fzf.vim', { 'depends': 'junegunn/fzf' })
  endif
  call dein#add('easymotion/vim-easymotion')
  call dein#add('satiani/bufferlist.vim')
  call dein#add('scrooloose/nerdtree')
  call dein#add('majutsushi/tagbar')
  call dein#add('sjl/gundo.vim')
  " }}}
  " Text manipulation {{{
  call dein#add('junegunn/vim-easy-align')
  call dein#add('mattn/emmet-vim')
  if has('nvim')
    call dein#add('bfredl/nvim-miniyank')
  endif
  call dein#add('tpope/vim-speeddating')
  " }}}
  " Code completion {{{
  call dein#add('Shougo/deoplete.nvim')
  call dein#config('deoplete.nvim', {
  \ 'lazy' : 1, 'on_i' : 1,
  \ })
  call dein#add('carlitux/deoplete-ternjs')
  call dein#add('ternjs/tern_for_vim')
  if !has('nvim')
    call dein#add('roxma/nvim-yarp')
    call dein#add('roxma/vim-hug-neovim-rpc')
  endif
  call dein#add('autozimu/LanguageClient-neovim', {'build': 'bash install.sh'})
  " }}}
  " Version control {{{
  call dein#add('tpope/vim-fugitive')
  " }}}
  " Styling {{{
  call dein#add('vim-airline/vim-airline')
  call dein#add('vim-airline/vim-airline-themes')
  call dein#add('flazz/vim-colorschemes')
  call dein#add('xolox/vim-misc')
  call dein#add('xolox/vim-colorscheme-switcher', { 'depends': 'xolox/vim-misc' })
  call dein#add('luochen1990/rainbow')
  call dein#add('fenetikm/falcon')
  " }}}
  " External integrations {{{
  call dein#add('w0rp/ale')
  call dein#add('benmills/vimux')
  call dein#add('pitluga/vimux-nose-test')
  if !has('nvim')
    call dein#add('Shougo/vimshell.vim')
  endif
  " }}}
  " Enhanced Vim behavior {{{
  if has('nvim')
    call dein#add('lambdalisue/suda.vim')
  else
    call dein#add('tpope/vim-eunuch')
  endif
  call dein#add('tpope/vim-unimpaired')
  call dein#add('tpope/vim-sleuth')
  call dein#add('tpope/vim-repeat')
  call dein#add('henrik/vim-indexed-search')
  call dein#add('tmhedberg/matchit')
  " }}}
  " Modes {{{
  call dein#add('jceb/vim-orgmode')
  " }}}
  " Vim tools {{{
  " }}}
  " dein save state {{{
  " Required:
  call dein#end()
  call dein#save_state()
endif
" }}}
" dein install on startup? {{{
" if dein#check_install()
"   call dein#install()
" endif
" }}}
" User settings
" Vim options {{{
" General options {{{
colorscheme falcon
filetype plugin on
filetype indent off
syntax enable
set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
set backspace=indent,eol,start
set completeopt=longest,menuone
set tw=100
set diffopt=vertical,filler
set expandtab
if executable("rg")
  set grepprg=rg\ --vimgrep\ --no-heading
  set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=1000
set ignorecase
set incsearch
set modeline
set showmatch		" Show matching brackets.
set smartcase
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sts=4
set sw=4
set t_Co=256
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*
" }}}
" Neovim Specific options {{{
if has('nvim')
  tnoremap <C-w> <C-\><C-N><C-w>
  augroup terminal
    au!
    " Temporarily prevent recording inside terminals until I develop the muscle memory
    " no to click q after selecting text (which is how I exit copy mode in tmux)
    au BufEnter,FocusGained,BufEnter,BufWinEnter,WinEnter term://* map <buffer> q <Nop>
    au TermOpen * map <buffer> q <Nop>
  augroup END
endif
" }}}
" Key mappings {{{
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("Rg " . expand("<cword>"))<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
" Click F10 to get the highlight group under cursor
" (http://vim.wikia.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor)
map <F10> :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>
" }}}
" autcmds {{{
augroup general_autocmds
  au!
  au FileType   javascript,python,sh,c,cpp,java,html,css,php,vim
\               au BufWrite * %s/\s\+$//e
augroup END
" }}}
" }}}
" dein {{{
map <F9> :call dein#install()<CR>
" }}}
" Bufferlist {{{
map <silent> <F2> :call BufferList()<CR>
hi BufferSelected term=reverse ctermfg=black ctermbg=white cterm=NONE
hi BufferNormal term=NONE ctermfg=188 ctermbg=237 cterm=NONE
let g:BufferListMaxWidth = 60
" }}}
" Rainbow Parentheses {{{
let g:rainbow_active = 1
" }}}
" FZF {{{
command! FZFMru call fzf#run({
\ 'source':  reverse(s:all_files()),
\ 'sink':    'edit',
\ 'options': '-m -x +s',
\ 'down':    '40%' })

function! s:all_files()
  return extend(
  \ reverse(filter(copy(v:oldfiles),
  \        "v:val !~ 'fugitive:\\|NERD_tree\\|^/tmp/\\|.git/\\|term:\\|_Gundo_'")),
  \ map(filter(range(1, bufnr('$')), 'buflisted(v:val)'), 'bufname(v:val)'))
endfunction
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BTags<CR>
nnoremap <C-b> :FZFMru<CR>
nnoremap <C-e> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --hidden --files --follow --glob "!.git/*" 2>/dev/null'
let g:fzf_history_dir = '~/.local/share/fzf-history'
" }}}
" Airline {{{
let g:airline_theme='falcon'
let g:airline_section_x=airline#section#create_right(['tagbar', ' ', 'filetype'])
let g:airline_section_y=airline#section#create_right([])
let g:airline_symbols.branch=''
let g:airline#extensions#fugitiveline#enabled = 0
" }}}
" ale {{{
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard']
\}
let g:ale_linters={
\    'javascript': ['standard'],
\}
nmap <Leader>F <Plug>(ale_fix)
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>
highlight ALEError ctermbg=140
" }}}
" Fugitive {{{
map <Leader>G :Gstatus<CR>
" }}}
" NERDTree {{{
function! SwitchToNerdTree(path)
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        elseif winnr != -1
            NERDTreeToggle
            return
        endif
    endif

    if a:path == ""
        NERDTreeToggle
    else
        exec("NERDTree " . a:path)
    endif
endfunction
let NERDTreeHijackNetrw = 0
let NERDTreeWinSize = 40
let NERDTreeIgnore = ['\.pyc$']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>
" }}}
" UtilSnips {{{
let g:UltiSnipsExpandTrigger="<s-tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"
" }}}
" vim-easy-align {{{
xmap ga <Plug>(EasyAlign)
let g:easy_align_ignore_groups = []
" }}}
" Tagbar {{{
map <silent><F5>  :TagbarToggle<CR>
let g:tagbar_left = 1
let g:tagbar_autoclose = 1
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" vimux/neovim terminal {{{
if has('nvim')
  map <Leader>vn :10split term://~/code/web/npm_dev.sh \| startinsert<CR>
  map <Leader>vi :20split term://zsh \| sleep 100m \| startinsert<CR>cd ~/code/web && source venv/bin/activate && python manage.py shell<CR><C-\><C-n>
  map <Leader>vl :10split term://zsh \| sleep 100m \| startinsert<CR>tail -f /var/liwwa/log/**/*.log~**/*apache_access.log<CR><C-\><C-n>
else
  function! VimuxIPython()
      call VimuxSendText(@v)
  endfunction
  augroup vimux_python
    au!
    au BufEnter *.py vmap <buffer> <Leader>vr "vy :call VimuxIPython()<CR>
  augroup END
  map <Leader>vn :VimuxRunCommand("cd ~/code/web; ./npm_dev.sh")<CR>
  map <Leader>vi :VimuxRunCommand("cd ~/code/web; source venv/bin/activate; python manage.py shell")<CR>
  map <Leader>vl :VimuxRunCommand("tail -f /var/liwwa/log/**/*.log~**/*apache_access.log")<CR>
  map <Leader>vp :VimuxPromptCommand<CR>
  map <Leader>vc :VimuxCloseRunner<CR>
endif
" }}}
" tern for vim {{{
let g:tern#command = [expand("~/.langservers/javascript/run.sh")]
let g:tern#arguments = ["--persistent"]
au FileType javascript map <buffer> <Leader>D :TernDef<CR>
au FileType javascript map <buffer> <Leader>d :TernDefPreview<CR>
au FileType javascript map <buffer> <Leader>r :TernRename<CR>
" }}}
" deoplete {{{
let g:deoplete#enable_at_startup = 1
let g:deoplete#sources = {}
let g:deoplete#sources.python = ['LanguageClient', 'file', 'around', 'ultisnips']
let g:deoplete#sources.javascript = ['tern', 'file', 'around', 'ultisnips']
inoremap <silent><expr> <TAB> pumvisible() ? "\<C-n>" : "\<TAB>"
inoremap <silent><expr> <C-Space> deoplete#mappings#manual_complete()
inoremap <silent><expr> <c-d> pumvisible() ? "\<PageDown>" : "\<c-d>"
inoremap <silent><expr> <c-u> pumvisible() ? "\<PageUp>" : "\<c-u>"
function! s:check_back_space() abort "{{{
let col = col('.') - 1
return getline('.')[col - 1]  =~ '\.'
endfunction"}}}
" }}}
" deoplete-ternjs {{{
let g:deoplete#sources#ternjs#tern_bin = '/home/satiani/.langservers/javascript/run.sh'
let g:deoplete#sources#ternjs#types = 1
let g:deoplete#sources#ternjs#depths = 1
let g:tern#filetypes = [
            \ 'jsx',
            \ 'javascript.jsx',
            \ 'vue',
            \ 'javascript'
            \ ]
" }}}
" LanguageServer {{{
let g:LanguageClient_serverCommands = {
    \ 'python': ['~/.langservers/python/run.sh', '~/code/web/venv/'],
    \ }
let g:LanguageClient_diagnosticsEnable = 0
augroup language_client
  au!
  au FileType python map <buffer> <Leader>d :call LanguageClient#textDocument_definition({'gotoCmd': 'split'})<CR>
  au FileType python map <buffer> <Leader>D :call LanguageClient_textDocument_definition()<CR>
  au FileType python map <buffer> <Leader>r :call LanguageClient#textDocument_rename()<CR>
  au FileType python map <buffer> <Leader>t :call LanguageClient_textDocument_documentSymbol()<CR>
  au User LanguageClientStarted command References call LanguageClient#textDocument_references()
  au User LanguageClientStopped delcommand References
  au User LanguageClientStarted map <silent><buffer> K :call LanguageClient_textDocument_hover()<CR>
augroup END
" }}}
" miniyank {{{
map p <Plug>(miniyank-autoput)
map P <Plug>(miniyank-autoPut)
map <localleader>[ <Plug>(miniyank-cycle)
" }}}
" gundo {{{
map <Leader>u :GundoShow<CR>
" }}}
" indentLine {{{
let g:indentLine_fileType = ['python']
" }}}
" liwwa {{{
augroup liwwa
  au!
  au BufWritePost *.py :silent !~/code/web/bin/compile_all.sh
  au BufEnter ~/code/web/app/static/**/*.html :set syntax=underscore_template
  au BufEnter *.html :silent RainbowToggleOff
augroup END
let g:python_host_prog  = '/usr/bin/python2'
" }}}
