" INSTALLATION: Drop this file into your ~/.vim/plugin folder
"
" WHAT DOES THIS DO:
"
" This script will look at the string under the cursor in the current buffer 
" and attempt to find ejs files named the same with the .ejs extension appended.
" The search for ejs files is started at the base directory for the file open in
" the current buffer and will search subdirectories recursively.
"
" USE:
"
" <Leader> in vim defaults to backslash '\', so <Leader>x means clicking
" \x in command mode.
"
"   - <Leader>x will open the ejs file found in a vertical split
"   - <Leader>X will open the ejs file found in a horizontal split

if has("python")
python << EOF
import vim
import os

def open_ejs_file(orientation):
    base_dir = os.path.dirname(vim.current.buffer.name)
    current_word = vim.eval("expand('<cword>')")

    ejs_file_name = "%s.ejs" % current_word

    for root_dir, dir_names, fnames in os.walk(base_dir):
        if ejs_file_name in fnames:
            full_path = os.path.join(root_dir, ejs_file_name)
            if orientation == 'vertical':
                vim.command("vsp " + full_path)
            else:
                vim.command("sp" + full_path)

            return

    print "No file named %s found" % ejs_file_name

EOF

map <Leader>x :py open_ejs_file("vertical")<CR>
map <Leader>X :py open_ejs_file("horizontal")<CR>
endif
